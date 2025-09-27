"use client"

// Columnist: Client-side persisted database on top of IndexedDB with
// simple schema, insert/query APIs, TF-IDF inverted index search,
// subscriptions, transactions, and lightweight stats.
//
// Important notes:
// - Prefers browser environment with IndexedDB, falls back to in-memory storage
// - Supports both client-side and server-side usage

// Node.js compatibility (will be handled by build process)

import { z } from "zod"
import { SyncManager } from "./sync"

type ColumnType = "string" | "number" | "boolean" | "date" | "json"

// Zod schema mapping for column types
const ColumnTypeSchemas = {
  string: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  date: z.date(),
  json: z.unknown()
} as const

export interface TableDefinition {
  columns: Record<string, ColumnType>
  primaryKey?: string // Defaults to "id" (autoIncrement)
  searchableFields?: string[] // Defaults to all string columns
  secondaryIndexes?: string[] // Optional list of columns to index for equality
  validation?: z.ZodSchema // Optional zod schema for validation
  vector?: {
    field: string // Source text field or externally managed
    dims: number // Embedding dimensions
  }
}

// Utility type to infer TypeScript types from TableDefinition
export type InferTableType<T extends TableDefinition> = {
  [K in keyof T["columns"]]: T["columns"][K] extends "string"
    ? string
    : T["columns"][K] extends "number"
    ? number
    : T["columns"][K] extends "boolean"
    ? boolean
    : T["columns"][K] extends "date"
    ? Date
    : T["columns"][K] extends "json"
    ? unknown
    : never
} & { id: number }

// Schema builder for fluent API
export class TableSchemaBuilder<T extends Record<string, ColumnType> = {}> {
  private def: Partial<TableDefinition> = { columns: {} as T }

  column<K extends string, V extends ColumnType>(
    name: K, 
    type: V
  ): TableSchemaBuilder<T & Record<K, V>> {
    (this.def.columns as any)[name] = type
    return this as any
  }

  primaryKey(field: keyof T): this {
    this.def.primaryKey = field as string
    return this
  }

  searchable(...fields: (keyof T)[]): this {
    this.def.searchableFields = fields as string[]
    return this
  }

  indexes(...fields: (keyof T)[]): this {
    this.def.secondaryIndexes = fields as string[]
    return this
  }

  validate(schema: z.ZodSchema): this {
    this.def.validation = schema
    return this
  }

  vector(config: { field: string; dims: number }): this {
    this.def.vector = config
    return this
  }

  build(): TableDefinition & { columns: T } {
    return {
      columns: this.def.columns as T,
      primaryKey: this.def.primaryKey,
      searchableFields: this.def.searchableFields,
      secondaryIndexes: this.def.secondaryIndexes,
      validation: this.def.validation,
      vector: this.def.vector
    }
  }
}

// Helper function to create schema builder
export function defineTable(): TableSchemaBuilder {
  return new TableSchemaBuilder()
}

export type SchemaDefinition = Record<string, TableDefinition>

// Device table schema for cross-device synchronization
export const DeviceTableSchema: TableDefinition = {
  columns: {
    deviceId: "string",
    deviceName: "string", 
    platform: "string",
    os: "string",
    browser: "string",
    screenResolution: "string",
    language: "string",
    timezone: "string",
    capabilities: "json",
    createdAt: "date",
    lastSeen: "date",
    syncProtocolVersion: "string"
  },
  primaryKey: "deviceId",
  searchableFields: ["deviceName", "platform", "os"],
  secondaryIndexes: ["createdAt", "lastSeen"]
};

export interface SearchOptions {
  table?: string
  limit?: number
  timeRange?: [Date | string, Date | string]
  // Any additional key:value provided here is treated as an equality filter on records
  // (except the reserved keys above)
  [key: string]: unknown
}

export interface WhereCondition {
  [field: string]: unknown | { $gt?: unknown; $gte?: unknown; $lt?: unknown; $lte?: unknown; $in?: unknown[] }
}

export interface FindOptions {
  table?: string
  where?: WhereCondition
  orderBy?: string | { field: string; direction?: "asc" | "desc" }
  limit?: number
  offset?: number
}

export interface InsertResult {
  id: number
}

export interface BulkOperationResult {
  success: number
  errors: Array<{ error: Error; record: any }>
}

interface TableStats {
  count: number
  totalBytes: number
}

interface ChangeEvent<T = unknown> {
  table: string
  type: "insert" | "update" | "delete"
  record: T & { id: number }
  oldRecord?: T & { id: number } // For update events
}

type Subscriber = (event: ChangeEvent) => void

const META_SCHEMA_STORE = "_meta_schema"
const META_STATS_STORE = "_meta_stats"
const DEFAULT_TABLE = "messages"

// Utility to wrap IDBRequest in a Promise
function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Utility to await transaction completion
function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"))
  })
}

function toISO(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  return value
}

function fromISO(type: ColumnType, value: unknown): unknown {
  if (type === "date" && typeof value === "string") return new Date(value)
  return value
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function norm(a: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s)
}

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}


function encodeCursor(obj: unknown): string {
  try {
    return btoa(JSON.stringify(obj))
  } catch {
    return JSON.stringify(obj)
  }
}

function decodeCursor<T>(s: string): T | null {
  try {
    return JSON.parse(atob(s)) as T
  } catch {
    try {
      return JSON.parse(s) as T
    } catch {
      return null
    }
  }
}

function isClientIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function suggestNodeJSCompatibility(): string {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'For Node.js usage, install fake-indexeddb: npm install --save-dev fake-indexeddb';
  }
  return 'This appears to be a non-browser environment. Columnist requires IndexedDB.';
}

// In-memory storage fallback for Node.js environments
interface InMemoryStore {
  data: Map<number | string, any>;
  indexes: Map<string, Map<any, Set<number | string>>>;
}

class InMemoryStorage {
  private stores: Map<string, InMemoryStore> = new Map();
  
  createStore(name: string): void {
    if (!this.stores.has(name)) {
      this.stores.set(name, {
        data: new Map(),
        indexes: new Map()
      });
    }
  }
  
  put(storeName: string, key: number | string, value: any): void {
    const store = this.stores.get(storeName);
    if (!store) throw new Error(`Store ${storeName} not found`);
    store.data.set(key, value);
  }
  
  get(storeName: string, key: number | string): any {
    const store = this.stores.get(storeName);
    return store?.data.get(key);
  }
  
  getAll(storeName: string): any[] {
    const store = this.stores.get(storeName);
    return store ? Array.from(store.data.values()) : [];
  }
  
  delete(storeName: string, key: number | string): void {
    const store = this.stores.get(storeName);
    store?.data.delete(key);
  }
  
  clear(storeName: string): void {
    const store = this.stores.get(storeName);
    store?.data.clear();
  }
}

// Global in-memory storage instance for Node.js
let inMemoryStorage: InMemoryStorage | null = null;

function getInMemoryStorage(): InMemoryStorage {
  if (!inMemoryStorage) {
    inMemoryStorage = new InMemoryStorage();
  }
  return inMemoryStorage;
}

// Build an object store name for the inverted index of a table
function indexStoreName(table: string): string {
  return `_ii_${table}`
}

// Per-table vector store name
function vectorStoreName(table: string): string {
  return `_vec_${table}`
}

// IVF index store name
function ivfStoreName(table: string): string {
  return `_ivf_${table}`
}

// Build a compound key to persist schema/meta entries by key
function metaKeyFor(table: string): string {
  return `schema:${table}`
}

function statsKeyFor(table: string): string {
  return `stats:${table}`
}

// Strongly typed database interface
export interface TypedColumnistDB<Schema extends SchemaDefinition> {
  // Insert with proper typing
  insert<K extends keyof Schema>(
    record: Omit<InferTableType<Schema[K]>, "id">, 
    table: K
  ): Promise<InsertResult>
  
  // Update with proper typing  
  update<K extends keyof Schema>(
    id: number,
    updates: Partial<Omit<InferTableType<Schema[K]>, "id">>, 
    table: K
  ): Promise<void>
  
  // Bulk operations
  bulkInsert<K extends keyof Schema>(
    records: Omit<InferTableType<Schema[K]>, "id">[], 
    table: K
  ): Promise<BulkOperationResult>
  
  bulkUpdate<K extends keyof Schema>(
    updates: Array<{ id: number; updates: Partial<Omit<InferTableType<Schema[K]>, "id">> }>,
    table: K
  ): Promise<BulkOperationResult>
  
  bulkDelete<K extends keyof Schema>(
    ids: number[],
    table: K
  ): Promise<BulkOperationResult>
  
  // Find with proper typing
  find<K extends keyof Schema>(
    options: Omit<FindOptions, "table"> & { table: K }
  ): Promise<InferTableType<Schema[K]>[]>
  
  // Search with proper typing
  search<K extends keyof Schema>(
    query: string,
    options: Omit<SearchOptions, "table"> & { table: K }
  ): Promise<(InferTableType<Schema[K]> & { score: number })[]>
  
  // Get all with proper typing
  getAll<K extends keyof Schema>(
    table: K, 
    limit?: number
  ): Promise<InferTableType<Schema[K]>[]>
}

export class ColumnistDB<Schema extends SchemaDefinition = SchemaDefinition> {
  private name: string
  private version: number
  private schema: SchemaDefinition
  private db: IDBDatabase | null = null
  private subscribers: Map<string, Set<Subscriber>> = new Map()
  private vectorEmbedders: Map<string, (input: string) => Promise<Float32Array>> = new Map()
  private migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void>
  private vectorCache: Map<string, Float32Array> = new Map()
  private encryptionKey: CryptoKey | null = null
  private authHooks: Map<string, (operation: string, table: string, data?: any) => boolean> = new Map()
  private syncManager: SyncManager | null = null

  private constructor(name: string, schema: SchemaDefinition, version: number, migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void>) {
    this.name = name
    this.schema = schema
    this.version = version
    this.migrations = migrations
    this.syncManager = new SyncManager(this)
  }

  static #instance: ColumnistDB | null = null

  static async init(name: string, opts?: { schema?: SchemaDefinition; version?: number; migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void>; encryptionKey?: string }): Promise<ColumnistDB> {
    const useInMemory = !isClientIndexedDBAvailable();
    
    if (useInMemory) {
      console.warn("IndexedDB not available. Falling back to in-memory storage. Data will not persist.");
    }

    const schema: SchemaDefinition = opts?.schema ?? {
      [DEFAULT_TABLE]: {
        columns: { id: "number", user_id: "number", message: "string", timestamp: "date" },
        primaryKey: "id",
        searchableFields: ["message"],
        secondaryIndexes: ["user_id", "timestamp"],
      },
    }
    const version = opts?.version ?? 1

    const instance = new ColumnistDB(name, schema, version, opts?.migrations)
    await instance.load()
    
    // Initialize encryption if key provided
    if (opts?.encryptionKey) {
      await instance.setEncryptionKey(opts.encryptionKey)
    }
    
    ColumnistDB.#instance = instance
    return instance
  }

  static getDB(): ColumnistDB {
    if (!ColumnistDB.#instance) {
      throw new Error("Columnist has not been initialized. Call ColumnistDB.init(...) first.")
    }
    return ColumnistDB.#instance
  }

  defineSchema(schema: SchemaDefinition, version?: number): void {
    this.schema = schema
    if (typeof version === "number") {
      this.version = version
    }
  }

  getSchema(): SchemaDefinition {
    return this.schema
  }

  async load(): Promise<void> {
    if (!isClientIndexedDBAvailable()) {
      throw new Error(`IndexedDB is not available. Columnist requires a browser environment.\n\n${suggestNodeJSCompatibility()}`)
    }

    const openReq = indexedDB.open(this.name, this.version)

    openReq.onupgradeneeded = (event) => {
      const db = openReq.result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion || 0
      // Ensure meta stores exist
      if (!db.objectStoreNames.contains(META_SCHEMA_STORE)) {
        db.createObjectStore(META_SCHEMA_STORE, { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains(META_STATS_STORE)) {
        db.createObjectStore(META_STATS_STORE, { keyPath: "key" })
      }

      // Create/upgrade table stores and their indexes
      for (const [table, def] of Object.entries(this.schema)) {
        const keyPath = def.primaryKey || "id"
        const autoIncrement = keyPath === "id"

        if (!db.objectStoreNames.contains(table)) {
          const store = db.createObjectStore(table, { keyPath, autoIncrement })
          // Secondary indexes
          for (const idx of def.secondaryIndexes || []) {
            try {
              store.createIndex(idx, idx, { unique: false })
            } catch {
              // If invalid, skip index creation (e.g., field not present yet)
            }
          }
        } else {
          // Upgrade path: add missing indexes if any
          const store = (openReq.transaction as IDBTransaction).objectStore(table)
          for (const idx of def.secondaryIndexes || []) {
            if (!Array.from(store.indexNames).includes(idx)) {
              try {
                store.createIndex(idx, idx, { unique: false })
              } catch {
                // Skip if creation fails
              }
            }
          }
        }

        // Create a per-table inverted index store
        const iiStore = indexStoreName(table)
        if (!db.objectStoreNames.contains(iiStore)) {
          db.createObjectStore(iiStore, { keyPath: "token" })
        }

        // Create a per-table vector store if vector config present
        if (def.vector) {
          const vs = vectorStoreName(table)
          if (!db.objectStoreNames.contains(vs)) {
            db.createObjectStore(vs, { keyPath: "id" })
          }
          
          // Create IVF index store for approximate nearest neighbor search
          const ivf = ivfStoreName(table)
          if (!db.objectStoreNames.contains(ivf)) {
            db.createObjectStore(ivf, { keyPath: "centroidId" })
          }
        }
      }

      // Run user-defined migrations for each version step
      if (this.migrations) {
        const tx = (openReq.transaction as IDBTransaction)
        for (let v = oldVersion + 1; v <= this.version; v++) {
          const mig = this.migrations[v]
          if (mig) {
            try {
              mig(db, tx, oldVersion)
            } catch (e) {
              console.error("Migration failed for version", v, e)
              throw e
            }
          }
        }
      }
    }

    this.db = await requestToPromise(openReq)

    // Write schema to meta (exclude validation functions which can't be cloned)
    const tx = this.db.transaction([META_SCHEMA_STORE], "readwrite")
    const metaStore = tx.objectStore(META_SCHEMA_STORE)
    for (const [table, def] of Object.entries(this.schema)) {
      const { validation, ...serializableDef } = def
      void metaStore.put({ key: metaKeyFor(table), value: serializableDef })
    }
    await awaitTransaction(tx)
  }

  // Validation helpers
  private validateRecord(record: Record<string, unknown>, def: TableDefinition): Record<string, unknown> {
    // Auto-generate schema from column definitions if no custom validation
    if (!def.validation) {
      const autoSchema = this.generateAutoSchema(def)
      const result = autoSchema.safeParse(record)
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`)
      }
      return result.data
    }

    // Use custom validation schema
    const result = def.validation.safeParse(record)
    if (!result.success) {
      throw new Error(`Validation failed: ${result.error.message}`)
    }
    return result.data
  }

  private generateAutoSchema(def: TableDefinition): z.ZodSchema {
    const shape: Record<string, z.ZodTypeAny> = {}
    
    for (const [column, type] of Object.entries(def.columns)) {
      let schema = ColumnTypeSchemas[type]
      
      // Make id optional for inserts (auto-generated)
      if (column === (def.primaryKey || "id")) {
        schema = schema.optional() as any
      }
      
      shape[column] = schema
    }
    
    return z.object(shape)
  }

  // Insert record into a table
  async update<T extends Record<string, unknown>>(id: number, updates: Partial<T>, table?: string): Promise<void> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    // Check authentication
    if (!this.checkAuth('update', tableName, { id, ...updates })) {
      throw new Error('Update operation not authorized')
    }

    const stores = [tableName, indexStoreName(tableName), META_STATS_STORE]
    if (def.vector) stores.push(vectorStoreName(tableName))
    const tx = this.db!.transaction(stores, "readwrite")
    const store = tx.objectStore(tableName)
    
    // Get the existing record
    const existing: any = await requestToPromise(store.get(id))
    if (!existing) {
      throw new Error(`Record with id ${id} not found in table ${tableName}`)
    }

    // Denormalize existing record for comparison
    const oldRecord: Record<string, unknown> = { ...existing }
    for (const [col, type] of Object.entries(def.columns)) {
      oldRecord[col] = fromISO(type as ColumnType, existing[col])
    }

    // Validate updates (partial validation for updates)
    if (def.validation) {
      // For updates, make all fields optional
      const updateSchema = (def.validation as any).partial()
      const result = updateSchema.safeParse(updates)
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`)
      }
    }

    // Normalize updates for storage
    const normalizedUpdates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(updates)) {
      const colType = def.columns[k]
      normalizedUpdates[k] = colType === "date" ? toISO(v) : v
    }

    // Merge updates into existing record
    const updated = { ...existing, ...normalizedUpdates }
    await requestToPromise(store.put(updated))

    // Update inverted index - remove old tokens, add new ones
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    const iiStore = tx.objectStore(indexStoreName(tableName))
    
    // Get old and new tokens for searchable fields
    const oldTokens = new Set<string>()
    const newTokens = new Set<string>()
    
    for (const field of searchable) {
      // Old tokens
      const oldRaw = oldRecord[field]
      if (typeof oldRaw === "string") {
        for (const tok of tokenize(oldRaw)) oldTokens.add(tok)
      }
      
      // New tokens (use updated value if provided, otherwise keep old)
      const newRaw = field in updates ? (updates as any)[field] : oldRecord[field]
      if (typeof newRaw === "string") {
        for (const tok of tokenize(newRaw)) newTokens.add(tok)
      }
    }

    // Remove id from tokens that are no longer present
    const removedTokens = new Set([...oldTokens].filter(tok => !newTokens.has(tok)))
    for (const token of removedTokens) {
      const entry = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(token))
      if (entry) {
        entry.ids = entry.ids.filter(recordId => recordId !== id)
        if (entry.ids.length === 0) {
          await requestToPromise(iiStore.delete(token))
        } else {
          await requestToPromise(iiStore.put(entry))
        }
      }
    }

    // Add id to new tokens
    const addedTokens = new Set([...newTokens].filter(tok => !oldTokens.has(tok)))
    for (const token of addedTokens) {
      const entry = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(token))
      if (entry) {
        if (!entry.ids.includes(id)) {
          entry.ids.push(id)
          await requestToPromise(iiStore.put(entry))
        }
      } else {
        await requestToPromise(iiStore.put({ token, ids: [id] }))
      }
    }

    // Update stats (byte difference)
    const statsStore = tx.objectStore(META_STATS_STORE)
    const key = statsKeyFor(tableName)
    const prev = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(key))
    if (prev) {
      const oldBytes = JSON.stringify(existing).length
      const newBytes = JSON.stringify(updated).length
      const byteDiff = newBytes - oldBytes
      const nextStats: TableStats = {
        count: prev.value.count, // Count stays the same
        totalBytes: prev.value.totalBytes + byteDiff,
      }
      await requestToPromise(statsStore.put({ key, value: nextStats }))
    }

    await awaitTransaction(tx)

    // Denormalize updated record for event
    const updatedRecord: Record<string, unknown> = { ...updated }
    for (const [col, type] of Object.entries(def.columns)) {
      updatedRecord[col] = fromISO(type as ColumnType, updated[col])
    }

    // Notify subscribers
    this.notify(tableName, { 
      table: tableName, 
      type: "update", 
      record: { ...(updatedRecord as any), id },
      oldRecord: { ...(oldRecord as any), id }
    })

    // Track change for synchronization
    this.trackSyncChange(tableName, 'update', { ...(updatedRecord as any), id })
  }

  async delete(id: number, table?: string): Promise<void> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    // Check authentication
    if (!this.checkAuth('delete', tableName, { id })) {
      throw new Error('Delete operation not authorized')
    }

    const stores = [tableName, indexStoreName(tableName), META_STATS_STORE]
    if (def.vector) stores.push(vectorStoreName(tableName))
    const tx = this.db!.transaction(stores, "readwrite")
    const store = tx.objectStore(tableName)
    
    // Get the existing record before deletion
    const existing: any = await requestToPromise(store.get(id))
    if (!existing) {
      throw new Error(`Record with id ${id} not found in table ${tableName}`)
    }

    // Delete the record
    await requestToPromise(store.delete(id))

    // Remove from inverted index
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    const iiStore = tx.objectStore(indexStoreName(tableName))
    const tokens = new Set<string>()
    
    for (const field of searchable) {
      const raw = existing[field]
      if (typeof raw === "string") {
        for (const tok of tokenize(raw)) tokens.add(tok)
      }
    }

    // Remove id from all tokens
    for (const token of tokens) {
      const entry = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(token))
      if (entry) {
        entry.ids = entry.ids.filter(recordId => recordId !== id)
        if (entry.ids.length === 0) {
          await requestToPromise(iiStore.delete(token))
        } else {
          await requestToPromise(iiStore.put(entry))
        }
      }
    }

    // Remove any vector entry
    if (def.vector) {
      const vStore = tx.objectStore(vectorStoreName(tableName))
      try {
        await requestToPromise(vStore.delete(id))
      } catch {}
    }

    // Update stats
    const statsStore = tx.objectStore(META_STATS_STORE)
    const key = statsKeyFor(tableName)
    const prev = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(key))
    if (prev) {
      const bytes = JSON.stringify(existing).length
      const nextStats: TableStats = {
        count: prev.value.count - 1,
        totalBytes: Math.max(0, prev.value.totalBytes - bytes),
      }
      await requestToPromise(statsStore.put({ key, value: nextStats }))
    }

    await awaitTransaction(tx)

    // Denormalize deleted record for event
    const deletedRecord: Record<string, unknown> = { ...existing }
    for (const [col, type] of Object.entries(def.columns)) {
      deletedRecord[col] = fromISO(type as ColumnType, existing[col])
    }

    // Notify subscribers
    this.notify(tableName, { 
      table: tableName, 
      type: "delete", 
      record: { ...(deletedRecord as any), id }
    })

    // Track change for synchronization
    this.trackSyncChange(tableName, 'delete', { id })
  }

  async upsert<T extends Record<string, unknown>>(record: T, table?: string): Promise<InsertResult> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    const pkField = def.primaryKey || "id"
    const pkValue = (record as any)[pkField]

    if (pkValue === undefined || pkValue === null) {
      // No primary key provided, insert new record
      return await this.insert(record, tableName)
    }

    // Check if record exists
    const tx = this.db!.transaction([tableName], "readonly")
    const store = tx.objectStore(tableName)
    const existing = await requestToPromise(store.get(pkValue))
    
    if (existing) {
      // Record exists, update it
      const { [pkField]: _, ...updates } = record // Remove PK from updates
      await this.update(pkValue, updates as any, tableName)
      return { id: pkValue }
    } else {
      // Record doesn't exist, insert it
      return await this.insert(record, tableName)
    }
  }

  /**
   * Bulk insert multiple records with optimized performance
   */
  async bulkInsert<T extends Record<string, unknown>>(records: T[], table?: string): Promise<BulkOperationResult> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    const result: BulkOperationResult = { success: 0, errors: [] }
    
    if (records.length === 0) {
      return result
    }
    
    const stores = [tableName, indexStoreName(tableName), META_STATS_STORE]
    if (def.vector) stores.push(vectorStoreName(tableName))
    const tx = this.db!.transaction(stores, "readwrite")
    const store = tx.objectStore(tableName)
    const iiStore = tx.objectStore(indexStoreName(tableName))
    const statsStore = tx.objectStore(META_STATS_STORE)
    
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)
    
    for (const record of records) {
      try {
        // Check authentication
        if (!this.checkAuth('insert', tableName, record)) {
          throw new Error('Insert operation not authorized')
        }
        
        // Validate record
        const validatedRecord = this.validateRecord(record, def)
        
        // Encrypt sensitive fields
        const encryptedRecord = await this.encryptSensitiveFields(validatedRecord, def)
        
        // Normalize for storage
        const normalized: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(encryptedRecord)) {
          const colType = def.columns[k]
          normalized[k] = colType === "date" ? toISO(v) : v
        }
        
        const id = await requestToPromise(store.add(normalized as any)) as unknown as number
        
        // Build inverted index
        const tokens = new Set<string>()
        for (const field of searchable) {
          const raw = (record as any)[field]
          if (typeof raw === "string") {
            for (const tok of tokenize(raw)) tokens.add(tok)
          }
        }
        
        for (const token of tokens) {
          const existing = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(token))
          if (existing) {
            if (!existing.ids.includes(id)) existing.ids.push(id)
            await requestToPromise(iiStore.put(existing))
          } else {
            await requestToPromise(iiStore.put({ token, ids: [id] }))
          }
        }
        
        // Update stats
        const key = statsKeyFor(tableName)
        const prev = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(key))
        const bytes = JSON.stringify(normalized).length
        const nextStats: TableStats = {
          count: (prev?.value.count ?? 0) + 1,
          totalBytes: (prev?.value.totalBytes ?? 0) + bytes,
        }
        await requestToPromise(statsStore.put({ key, value: nextStats }))
        
        result.success++
        
        // Notify subscribers
        this.notify(tableName, { table: tableName, type: "insert", record: { ...(record as any), id } })
        this.trackSyncChange(tableName, 'insert', { ...(record as any), id })
        
      } catch (error) {
        result.errors.push({ error: error as Error, record })
      }
    }
    
    await awaitTransaction(tx)
    return result
  }

  /**
   * Bulk update multiple records with optimized performance
   */
  async bulkUpdate<T extends Record<string, unknown>>(
    updates: Array<{ id: number; updates: Partial<T> }>, 
    table?: string
  ): Promise<BulkOperationResult> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    const result: BulkOperationResult = { success: 0, errors: [] }
    
    if (updates.length === 0) {
      return result
    }
    
    const stores = [tableName, indexStoreName(tableName), META_STATS_STORE]
    if (def.vector) stores.push(vectorStoreName(tableName))
    const tx = this.db!.transaction(stores, "readwrite")
    const store = tx.objectStore(tableName)
    
    for (const { id, updates: updateData } of updates) {
      try {
        await this.update(id, updateData, tableName)
        result.success++
      } catch (error) {
        result.errors.push({ error: error as Error, record: { id, updates: updateData } })
      }
    }
    
    await awaitTransaction(tx)
    return result
  }

  /**
   * Bulk delete multiple records with optimized performance
   */
  async bulkDelete(ids: number[], table?: string): Promise<BulkOperationResult> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    const result: BulkOperationResult = { success: 0, errors: [] }
    
    if (ids.length === 0) {
      return result
    }
    
    const stores = [tableName, indexStoreName(tableName), META_STATS_STORE]
    if (def.vector) stores.push(vectorStoreName(tableName))
    const tx = this.db!.transaction(stores, "readwrite")
    const store = tx.objectStore(tableName)
    
    for (const id of ids) {
      try {
        await this.delete(id, tableName)
        result.success++
      } catch (error) {
        result.errors.push({ error: error as Error, record: { id } })
      }
    }
    
    await awaitTransaction(tx)
    return result
  }

  async insert<T extends Record<string, unknown>>(record: T, table?: string): Promise<InsertResult> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    // Check authentication
    if (!this.checkAuth('insert', tableName, record)) {
      throw new Error('Insert operation not authorized')
    }

    // Validate record
    const validatedRecord = this.validateRecord(record, def)

    // Encrypt sensitive fields before storage
    const encryptedRecord = await this.encryptSensitiveFields(validatedRecord, def)

    // Normalize record for storage (convert Date to ISO)
    const normalized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(encryptedRecord)) {
      const colType = def.columns[k]
      normalized[k] = colType === "date" ? toISO(v) : v
    }

    const stores = [tableName, indexStoreName(tableName), META_STATS_STORE]
    if (def.vector) stores.push(vectorStoreName(tableName))
    const tx = this.db!.transaction(stores, "readwrite")
    const store = tx.objectStore(tableName)
    const id = await requestToPromise(store.add(normalized as any)) as unknown as number

    // Build/update inverted index for searchable fields
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    const iiStore = tx.objectStore(indexStoreName(tableName))
    const tokens = new Set<string>()
    for (const field of searchable) {
      const raw = (record as any)[field]
      if (typeof raw === "string") {
        for (const tok of tokenize(raw)) tokens.add(tok)
      }
    }

    for (const token of tokens) {
      const existing = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(token))
      if (existing) {
        if (!existing.ids.includes(id)) existing.ids.push(id)
        await requestToPromise(iiStore.put(existing))
      } else {
        await requestToPromise(iiStore.put({ token, ids: [id] }))
      }
    }

    // Persist vector embedding if configured
    if (def.vector) {
      const embedder = this.vectorEmbedders.get(tableName)
      if (embedder) {
        const source = (record as any)[def.vector.field]
        if (typeof source === "string" && source.trim().length > 0) {
          const vec = await embedder(source)
          if (!(vec instanceof Float32Array) || vec.length !== def.vector.dims) {
            throw new Error(`Embedding dimension mismatch for table ${tableName}. Expected ${def.vector.dims}, got ${vec.length}`)
          }
          const vStore = tx.objectStore(vectorStoreName(tableName))
          await requestToPromise(vStore.put({ id, vector: Array.from(vec) }))
        }
      }
    }

    // Update stats
    const statsStore = tx.objectStore(META_STATS_STORE)
    const key = statsKeyFor(tableName)
    const prev = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(key))
    const bytes = JSON.stringify(normalized).length
    const nextStats: TableStats = {
      count: (prev?.value.count ?? 0) + 1,
      totalBytes: (prev?.value.totalBytes ?? 0) + bytes,
    }
    await requestToPromise(statsStore.put({ key, value: nextStats }))

    await awaitTransaction(tx)

    // Notify subscribers
    this.notify(tableName, { table: tableName, type: "insert", record: { ...(record as any), id } })

    // Track change for synchronization
    this.trackSyncChange(tableName, 'insert', { ...(record as any), id })

    return { id }
  }

  async getAll<T = unknown>(table: string, limit = 1000): Promise<(T & { id: number })[]> {
    this.ensureDb()
    const def = this.ensureTable(table)
    
    // Check authentication
    if (!this.checkAuth('read', table)) {
      throw new Error('Read operation not authorized')
    }
    const out: (T & { id: number })[] = []
    const tx = this.db!.transaction([table], "readonly")
    const store = tx.objectStore(table)
    const req = store.openCursor()
    return new Promise((resolve, reject) => {
      req.onsuccess = async () => {
        const cursor = req.result
        if (cursor) {
          const value: any = cursor.value
          value.id = cursor.primaryKey as number
          
          // Decrypt sensitive fields after retrieval
          const decryptedValue = await this.decryptSensitiveFields(value, def)
          out.push(decryptedValue as T & { id: number })
          
          if (out.length >= limit) {
            resolve(out)
            return
          }
          cursor.continue()
        } else {
          resolve(out)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  async find<T = any>(options: FindOptions = {}): Promise<(T & { id: number })[]> {
    this.ensureDb()
    const tableName = options.table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)
    
    // Check authentication
    if (!this.checkAuth('read', tableName)) {
      throw new Error('Read operation not authorized')
    }
    const limit = options.limit || 1000
    const offset = options.offset || 0

    const tx = this.db!.transaction([tableName], "readonly")
    const store = tx.objectStore(tableName)

    // Parse orderBy
    let orderField: string | null = null
    let orderDirection: "asc" | "desc" = "asc"
    if (options.orderBy) {
      if (typeof options.orderBy === "string") {
        orderField = options.orderBy
      } else {
        orderField = options.orderBy.field
        orderDirection = options.orderBy.direction || "asc"
      }
    }

    // Parse where conditions
    const where = options.where || {}
    const whereFields = Object.keys(where)

    // Determine best query strategy
    let useIndex = false
    let indexField: string | null = null
    let indexRange: IDBKeyRange | undefined = undefined

    // Check if we can use an index for ordering or filtering
    if (orderField && this.hasIndex(def, orderField)) {
      useIndex = true
      indexField = orderField
    } else if (whereFields.length > 0) {
      // Find first where field that has an index
      for (const field of whereFields) {
        if (this.hasIndex(def, field)) {
          useIndex = true
          indexField = field
          indexRange = this.buildKeyRange(where[field])
          break
        }
      }
    }

    const results: (T & { id: number })[] = []
    let skipped = 0

    if (useIndex && indexField) {
      // Use index-optimized query
      const index = indexField === (def.primaryKey || "id") 
        ? store 
        : store.index(indexField)
      
      const direction = orderDirection === "desc" ? "prev" : "next"
      const cursorReq = index.openCursor(indexRange, direction)

      await new Promise<void>((resolve, reject) => {
        cursorReq.onsuccess = async () => {
          const cursor = cursorReq.result
          if (!cursor || results.length >= limit) {
            resolve()
            return
          }

          const record: any = cursor.value
          const id = typeof cursor.primaryKey === "number" ? cursor.primaryKey : (record.id as number)
          
          // Denormalize dates
          for (const [col, type] of Object.entries(def.columns)) {
            record[col] = fromISO(type as ColumnType, record[col])
          }
          record.id = id

          // Decrypt sensitive fields
          const decryptedRecord = await this.decryptSensitiveFields(record, def)

          // Apply remaining where conditions
          if (this.matchesWhere(decryptedRecord, where)) {
            if (skipped >= offset) {
              results.push(decryptedRecord as T & { id: number })
            } else {
              skipped++
            }
          }

          cursor.continue()
        }
        cursorReq.onerror = () => reject(cursorReq.error)
      })
    } else {
      // Fallback to full table scan
      const cursorReq = store.openCursor()
      
      await new Promise<void>((resolve, reject) => {
        cursorReq.onsuccess = async () => {
          const cursor = cursorReq.result
          if (!cursor || results.length >= limit) {
            resolve()
            return
          }

          const record: any = cursor.value
          const id = cursor.primaryKey as number
          
          // Denormalize dates
          for (const [col, type] of Object.entries(def.columns)) {
            record[col] = fromISO(type as ColumnType, record[col])
          }
          record.id = id

          // Decrypt sensitive fields
          const decryptedRecord = await this.decryptSensitiveFields(record, def)

          // Apply where conditions
          if (this.matchesWhere(decryptedRecord, where)) {
            if (skipped >= offset) {
              results.push(decryptedRecord as T & { id: number })
            } else {
              skipped++
            }
          }

          cursor.continue()
        }
        cursorReq.onerror = () => reject(cursorReq.error)
      })

      // Sort if needed and no index was used
      if (orderField && !useIndex) {
        results.sort((a, b) => {
          const aVal = (a as any)[orderField!]
          const bVal = (b as any)[orderField!]
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
          return orderDirection === "desc" ? -comparison : comparison
        })
      }
    }

    return results
  }

  async search<T = any>(query: string, options: SearchOptions = {}): Promise<(T & { id: number; score: number })[]> {
    this.ensureDb()
    const table = (options.table as string) || DEFAULT_TABLE
    const def = this.ensureTable(table)
    const limit = typeof options.limit === "number" ? options.limit : 50

    const tx = this.db!.transaction([table, indexStoreName(table), META_STATS_STORE], "readonly")
    const iiStore = tx.objectStore(indexStoreName(table))
    const tableStore = tx.objectStore(table)
    const tokens = tokenize(query)

    // Read stats for IDF
    const statsStore = tx.objectStore(META_STATS_STORE)
    const statsKey = statsKeyFor(table)
    const statsEntry = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(statsKey))
    const totalDocs = statsEntry?.value.count ?? 0

    const idToScore = new Map<number, number>()
    for (const tok of tokens) {
      const entry = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(tok))
      const ids = entry?.ids || []
      const df = ids.length || 1
      const idf = Math.log((totalDocs + 1) / df)
      for (const id of ids) {
        idToScore.set(id, (idToScore.get(id) || 0) + idf)
      }
    }

    // Convert equality filters from options (exclude reserved keys)
    const reserved = new Set(["table", "limit", "timeRange"]) as Set<string>
    const equalityFilters: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(options)) {
      if (!reserved.has(k)) equalityFilters[k] = v
    }

    const range = options.timeRange
    let start: number | null = null
    let end: number | null = null
    if (range) {
      const s = range[0] instanceof Date ? (range[0] as Date) : new Date(range[0] as string)
      const e = range[1] instanceof Date ? (range[1] as Date) : new Date(range[1] as string)
      start = s.getTime()
      end = e.getTime()
    }

    // Gather candidate ids. If no tokens, consider full scan.
    const candidateIds = idToScore.size > 0 ? Array.from(idToScore.keys()) : await this.collectAllIds(table)

    const results: (T & { id: number; score: number })[] = []
    
    // Process each record with individual transactions to avoid timeout
    for (const id of candidateIds) {
      // Create a new transaction for each record to avoid transaction completion issues
      const singleTx = this.db!.transaction([table], "readonly")
      const singleStore = singleTx.objectStore(table)
      
      const rec: any = await requestToPromise(singleStore.get(id))
      if (!rec) continue
      rec.id = id

      // Convert dates back
      for (const [col, type] of Object.entries(def.columns)) {
        rec[col] = fromISO(type as ColumnType, rec[col])
      }

      if (this.passesFilters(rec, equalityFilters) && this.passesTimeRange(rec, def, start, end)) {
        const score = idToScore.get(id) || 0
        results.push({ ...(rec as T), score, id })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  // Register an embedder function for a table. The embedder must return Float32Array of length dims.
  registerEmbedder(table: string, embedder: (input: string) => Promise<Float32Array>): void {
    this.ensureTable(table)
    this.vectorEmbedders.set(table, embedder)
  }

  // Security audit: Check for potential security issues
  async securityAudit(): Promise<{
    issues: string[]
    recommendations: string[]
  }> {
    const issues: string[] = []
    const recommendations: string[] = []
    
    // Check if running in browser environment (more secure)
    if (typeof window === 'undefined') {
      issues.push('Running in Node.js environment - data may be less secure')
      recommendations.push('Use browser environment for production applications')
    }
    
    // Check for large datasets that might need encryption
    const stats = await this.getStats()
    if (typeof stats !== 'object' || !('overallBytes' in stats)) {
      return { issues, recommendations }
    }
    
    const { overallBytes, tables } = stats as { overallBytes: number; tables: Record<string, TableStats> }
    
    if (overallBytes > 10 * 1024 * 1024) { // 10MB threshold
      issues.push('Large dataset detected - consider encryption for sensitive data')
      recommendations.push('Implement encryption at rest for sensitive information')
    }
    
    // Check for potential sensitive field names
    const sensitivePatterns = [/password/i, /secret/i, /key/i, /token/i, /auth/i]
    for (const [tableName, tableDef] of Object.entries(this.schema)) {
      for (const fieldName of Object.keys(tableDef.columns)) {
        if (sensitivePatterns.some(pattern => pattern.test(fieldName))) {
          issues.push(`Potential sensitive field name detected: ${tableName}.${fieldName}`)
          recommendations.push(`Consider encrypting sensitive field: ${tableName}.${fieldName}`)
        }
      }
    }
    
    return { issues, recommendations }
  }

  // Encryption methods
  async setEncryptionKey(key: string): Promise<void> {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not available in this environment')
    }
    
    // Derive key from password using PBKDF2
    const encoder = new TextEncoder()
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      'PBKDF2',
      false,
      ['deriveKey']
    )
    
    this.encryptionKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('columnist-encryption-salt'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    )
  }

  private async encryptData(data: string): Promise<string> {
    if (!this.encryptionKey) return data
    
    const encoder = new TextEncoder()
    const iv = window.crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      this.encryptionKey,
      encoder.encode(data)
    )
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)
    
    return btoa(String.fromCharCode(...combined))
  }

  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) return encryptedData
    
    try {
      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)))
      const iv = combined.slice(0, 12)
      const data = combined.slice(12)
      
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        this.encryptionKey,
        data
      )
      
      return new TextDecoder().decode(decrypted)
    } catch {
      return encryptedData // Return original if decryption fails
    }
  }

  private async encryptSensitiveFields(record: Record<string, unknown>, def: TableDefinition): Promise<Record<string, unknown>> {
    if (!this.encryptionKey) return record
    
    const sensitivePatterns = [/password/i, /secret/i, /key/i, /token/i, /auth/i]
    const result = { ...record }
    
    for (const [field, value] of Object.entries(record)) {
      if (typeof value === 'string' && sensitivePatterns.some(pattern => pattern.test(field))) {
        result[field] = await this.encryptData(value)
      }
    }
    
    return result
  }

  private async decryptSensitiveFields(record: Record<string, unknown>, def: TableDefinition): Promise<Record<string, unknown>> {
    if (!this.encryptionKey) return record
    
    const sensitivePatterns = [/password/i, /secret/i, /key/i, /token/i, /auth/i]
    const result = { ...record }
    
    for (const [field, value] of Object.entries(record)) {
      if (typeof value === 'string' && sensitivePatterns.some(pattern => pattern.test(field))) {
        result[field] = await this.decryptData(value)
      }
    }
    
    return result
  }

  // Authentication hooks
  registerAuthHook(name: string, hook: (operation: string, table: string, data?: any) => boolean): void {
    this.authHooks.set(name, hook)
  }

  removeAuthHook(name: string): void {
    this.authHooks.delete(name)
  }

  private checkAuth(operation: string, table: string, data?: any): boolean {
    if (this.authHooks.size === 0) return true
    
    for (const hook of this.authHooks.values()) {
      if (!hook(operation, table, data)) {
        return false
      }
    }
    
    return true
  }

  // Build IVF index for approximate nearest neighbor search
  async buildIVFIndex(table: string, numCentroids: number = 16): Promise<void> {
    this.ensureDb()
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)
    
    const tx = this.db!.transaction([vectorStoreName(table), ivfStoreName(table)], "readwrite")
    const vStore = tx.objectStore(vectorStoreName(table))
    const ivfStore = tx.objectStore(ivfStoreName(table))
    
    // Collect all vectors
    const allVectors: { id: number; vector: Float32Array }[] = []
    await new Promise<void>((resolve, reject) => {
      const req = vStore.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve()
          return
        }
        const { id, vector } = cursor.value
        allVectors.push({ id, vector: new Float32Array(vector) })
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
    
    if (allVectors.length === 0) return
    
    // Simple k-means clustering for centroids
    const dims = def.vector.dims
    const centroids: Float32Array[] = []
    
    // Initialize centroids with random vectors
    for (let i = 0; i < numCentroids; i++) {
      const randomIdx = Math.floor(Math.random() * allVectors.length)
      centroids.push(allVectors[randomIdx].vector)
    }
    
    // Simple k-means iteration
    for (let iter = 0; iter < 10; iter++) {
      const clusters: number[][] = Array(numCentroids).fill(null).map(() => [])
      
      // Assign vectors to nearest centroid
      for (const { id, vector } of allVectors) {
        let minDist = Infinity
        let bestCentroid = 0
        
        for (let i = 0; i < centroids.length; i++) {
          const dist = this.euclideanDistance(vector, centroids[i])
          if (dist < minDist) {
            minDist = dist
            bestCentroid = i
          }
        }
        clusters[bestCentroid].push(id)
      }
      
      // Update centroids
      for (let i = 0; i < centroids.length; i++) {
        if (clusters[i].length > 0) {
          const newCentroid = new Float32Array(dims)
          for (const id of clusters[i]) {
            const vec = allVectors.find(v => v.id === id)?.vector
            if (vec) {
              for (let j = 0; j < dims; j++) {
                newCentroid[j] += vec[j]
              }
            }
          }
          for (let j = 0; j < dims; j++) {
            newCentroid[j] /= clusters[i].length
          }
          centroids[i] = newCentroid
        }
      }
    }
    
    // Store centroids and their associated vectors
    for (let centroidId = 0; centroidId < centroids.length; centroidId++) {
      const clusterIds: number[] = []
      for (const { id, vector } of allVectors) {
        let minDist = Infinity
        let bestCentroid = 0
        
        for (let i = 0; i < centroids.length; i++) {
          const dist = this.euclideanDistance(vector, centroids[i])
          if (dist < minDist) {
            minDist = dist
            bestCentroid = i
          }
        }
        
        if (bestCentroid === centroidId) {
          clusterIds.push(id)
        }
      }
      
      if (clusterIds.length > 0) {
        await requestToPromise(ivfStore.put({
          centroidId,
          centroid: Array.from(centroids[centroidId]),
          vectorIds: clusterIds
        }))
      }
    }
    
    await awaitTransaction(tx)
  }

  // Cache vector for faster repeated queries
  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  }

  private cacheVector(key: string, vector: Float32Array): void {
    this.vectorCache.set(key, vector);
    // Limit cache size to prevent memory issues
    if (this.vectorCache.size > 1000) {
      const firstKey = this.vectorCache.keys().next().value;
      if (firstKey) this.vectorCache.delete(firstKey);
    }
  }

  // Get cached vector or compute and cache
  private async getCachedVector(table: string, text: string): Promise<Float32Array> {
    const cacheKey = `${table}:${text}`;
    const cached = this.vectorCache.get(cacheKey);
    if (cached) return cached;
    
    const embedder = this.vectorEmbedders.get(table);
    if (!embedder) throw new Error(`No embedder registered for table ${table}`);
    
    const vector = await embedder(text);
    this.cacheVector(cacheKey, vector);
    return vector;
  }

  // Convenience method for text-based vector search with caching
  async vectorSearchText<T = any>(
    table: string,
    queryText: string,
    opts?: { metric?: "cosine" | "dot" | "euclidean"; limit?: number; where?: WhereCondition }
  ): Promise<(T & { id: number; score: number })[]> {
    const vector = await this.getCachedVector(table, queryText);
    return this.vectorSearch(table, vector, opts);
  }

  // Vector search using cosine similarity (default) or dot/euclidean
  async vectorSearch<T = any>(
    table: string,
    inputVector: Float32Array,
    opts?: { metric?: "cosine" | "dot" | "euclidean"; limit?: number; where?: WhereCondition; useIVF?: boolean }
  ): Promise<(T & { id: number; score: number })[]> {
    this.ensureDb()
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)
    if (inputVector.length !== def.vector.dims) throw new Error(`Vector dimension mismatch. Expected ${def.vector.dims}`)

    const limit = opts?.limit ?? 50
    const metric = opts?.metric ?? "cosine"
    const useIVF = opts?.useIVF ?? false

    const tx = this.db!.transaction([table, vectorStoreName(table), ivfStoreName(table)], "readonly")
    const vStore = tx.objectStore(vectorStoreName(table))
    const tStore = tx.objectStore(table)
    const ivfStore = tx.objectStore(ivfStoreName(table))

    const inputNorm = metric === "cosine" ? norm(inputVector) : 1
    const results: { id: number; score: number }[] = []

    if (useIVF) {
      // Use IVF index for approximate nearest neighbor search
      try {
        // Find nearest centroids
        const centroidDistances: { centroidId: number; distance: number }[] = []
        await new Promise<void>((resolve, reject) => {
          const req = ivfStore.openCursor()
          req.onsuccess = () => {
            const cursor = req.result
            if (!cursor) {
              resolve()
              return
            }
            const { centroidId, centroid } = cursor.value
            const centroidVec = new Float32Array(centroid)
            const distance = this.euclideanDistance(inputVector, centroidVec)
            centroidDistances.push({ centroidId, distance })
            cursor.continue()
          }
          req.onerror = () => reject(req.error)
        })

        // Sort centroids by distance and take top 3
        centroidDistances.sort((a, b) => a.distance - b.distance)
        const nearestCentroids = centroidDistances.slice(0, 3)

        // Search only in nearest clusters
        for (const { centroidId } of nearestCentroids) {
          const ivfEntry = await requestToPromise(ivfStore.get(centroidId))
          if (ivfEntry && ivfEntry.vectorIds) {
            for (const id of ivfEntry.vectorIds) {
              const vecEntry = await requestToPromise(vStore.get(id))
              if (vecEntry) {
                const v = new Float32Array(vecEntry.vector)
                let score = 0
                if (metric === "cosine") score = dot(inputVector, v) / (inputNorm * norm(v) || 1)
                else if (metric === "dot") score = dot(inputVector, v)
                else if (metric === "euclidean") score = -euclideanDistance(inputVector, v)

                results.push({ id, score })
                
                // Early termination if we have enough candidates
                if (results.length >= limit * 2) {
                  break
                }
              }
            }
          }
          if (results.length >= limit * 2) {
            break
          }
        }
      } catch {
        // Fall back to full scan if IVF index is not available
        console.warn("IVF index not available, falling back to full scan")
      }
    }

    // Fallback to full scan if IVF is disabled or failed
    if (results.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const req = vStore.openCursor()
        req.onsuccess = async () => {
          const cursor = req.result
          if (!cursor) {
            resolve()
            return
          }
          const { id, vector } = cursor.value as { id: number; vector: number[] }
          const v = new Float32Array(vector)
          let score = 0
          if (metric === "cosine") score = dot(inputVector, v) / (inputNorm * norm(v) || 1)
          else if (metric === "dot") score = dot(inputVector, v)
          else if (metric === "euclidean") score = -euclideanDistance(inputVector, v)

          results.push({ id, score })
          
          // Early termination for large datasets - stop after collecting 2x limit
          if (results.length >= limit * 3) {
            console.log("Early termination at", results.length, "vectors")
            resolve()
            return
          }
          
          cursor.continue()
        }
        req.onerror = () => {
          console.error("Vector cursor error:", req.error)
          reject(req.error)
        }
      })
    }

    // Fetch records, apply optional where, sort and limit
    const out: (T & { id: number; score: number })[] = []
    for (const { id, score } of results) {
      const rec: any = await requestToPromise(tStore.get(id))
      if (!rec) continue
      // Optional where filters
      if (opts?.where && !this.matchesWhere(rec, opts.where)) continue
      out.push({ ...(rec as T), id, score })
    }
    out.sort((a, b) => b.score - a.score)
    return out.slice(0, limit)
  }

  // Export data for selected tables (or all) as a JSON object
  async export(options?: { tables?: string[] }): Promise<Record<string, unknown[]>> {
    this.ensureDb()
    const tables = options?.tables ?? Object.keys(this.schema)
    const result: Record<string, unknown[]> = {}
    for (const table of tables) {
      const all = await this.getAll<any>(table, Number.MAX_SAFE_INTEGER)
      result[table] = all
    }
    return result
  }

  // Import data with merge or replace mode
  async import(data: Record<string, unknown[]>, mode: "merge" | "replace" = "merge"): Promise<void> {
    this.ensureDb()
    const allStores = new Set<string>([META_STATS_STORE])
    for (const table of Object.keys(data)) {
      this.ensureTable(table)
      allStores.add(table)
      allStores.add(indexStoreName(table))
      if (this.schema[table].vector) allStores.add(vectorStoreName(table))
    }
    const tx = this.db!.transaction(Array.from(allStores), "readwrite")
    for (const [table, rows] of Object.entries(data)) {
      const def = this.ensureTable(table)
      const store = tx.objectStore(table)
      const ii = tx.objectStore(indexStoreName(table))
      const vStore = def.vector ? tx.objectStore(vectorStoreName(table)) : null

      if (mode === "replace") {
        await requestToPromise(store.clear())
        await requestToPromise(ii.clear())
        if (vStore) await requestToPromise(vStore.clear())
      }

      for (const row of rows as any[]) {
        const { id, ...rest } = row
        const insertRes = await requestToPromise(store.put({ ...rest, id }))
        const assignedId = (insertRes as any) ?? id
        // Rebuild text index
        const searchable = (def.searchableFields && def.searchableFields.length > 0)
          ? def.searchableFields
          : Object.entries(def.columns).filter(([, t]) => t === "string").map(([name]) => name)
        const tokenSet = new Set<string>()
        for (const f of searchable) {
          const raw = (row as any)[f]
          if (typeof raw === "string") for (const t of tokenize(raw)) tokenSet.add(t)
        }
        for (const token of tokenSet) {
          const existing = await requestToPromise<{ token: string; ids: number[] } | undefined>(ii.get(token))
          if (existing) {
            if (!existing.ids.includes(assignedId)) existing.ids.push(assignedId)
            await requestToPromise(ii.put(existing))
          } else {
            await requestToPromise(ii.put({ token, ids: [assignedId] }))
          }
        }
        // Restore vector if present in row
        if (vStore && (row as any).vector && Array.isArray((row as any).vector)) {
          await requestToPromise(vStore.put({ id: assignedId, vector: (row as any).vector }))
        }
      }
    }
    await awaitTransaction(tx)
  }

  // Keyset pagination returning a cursor
  async findPage<T = any>(options: FindOptions & { cursor?: string }): Promise<{ data: (T & { id: number })[]; nextCursor: string | null }> {
    const limit = options.limit || 50
    let results = await this.find<T>(options)
    if (options.cursor) {
      const cursor = decodeCursor<{ lastId: number; lastValue?: unknown }>(options.cursor)
      if (cursor) {
        results = results.filter(r => r.id > cursor.lastId)
      }
    }
    const page = results.slice(0, limit)
    const last = page[page.length - 1]
    const nextCursor = last ? encodeCursor({ lastId: last.id }) : null
    return { data: page, nextCursor }
  }

  async transaction(work: (tx: { insert: <T extends Record<string, unknown>>(record: T, table?: string) => Promise<InsertResult> }) => Promise<void>): Promise<void> {
    this.ensureDb()
    // We open a readwrite transaction across all current stores for simplicity
    const storeNames = this.allStoreNamesForTx()
    const tx = this.db!.transaction(storeNames, "readwrite")
    const insert = async <T extends Record<string, unknown>>(record: T, table?: string) => {
      // Re-implement insert logic but using provided tx
      const tableName = table || DEFAULT_TABLE
      const def = this.ensureTable(tableName)
      const normalized: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(record)) {
        const colType = def.columns[k]
        normalized[k] = colType === "date" ? toISO(v) : v
      }

      const store = tx.objectStore(tableName)
      const id = await requestToPromise(store.add(normalized as any)) as unknown as number

      // Update inverted index
      const searchable = (def.searchableFields && def.searchableFields.length > 0)
        ? def.searchableFields
        : Object.entries(def.columns).filter(([, t]) => t === "string").map(([name]) => name)
      const iiStore = tx.objectStore(indexStoreName(tableName))
      const tokens = new Set<string>()
      for (const field of searchable) {
        const raw = (record as any)[field]
        if (typeof raw === "string") {
          for (const tok of tokenize(raw)) tokens.add(tok)
        }
      }
      for (const token of tokens) {
        const existing = await requestToPromise<{ token: string; ids: number[] } | undefined>(iiStore.get(token))
        if (existing) {
          if (!existing.ids.includes(id)) existing.ids.push(id)
          await requestToPromise(iiStore.put(existing))
        } else {
          await requestToPromise(iiStore.put({ token, ids: [id] }))
        }
      }

      // Update stats
      const statsStore = tx.objectStore(META_STATS_STORE)
      const key = statsKeyFor(tableName)
      const prev = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(key))
      const bytes = JSON.stringify(normalized).length
      const nextStats: TableStats = {
        count: (prev?.value.count ?? 0) + 1,
        totalBytes: (prev?.value.totalBytes ?? 0) + bytes,
      }
      await requestToPromise(statsStore.put({ key, value: nextStats }))

      // Notify subscribers after outer transaction completes
      queueMicrotask(() => this.notify(tableName, { table: tableName, type: "insert", record: { ...(record as any), id } }))

      return { id }
    }

    await work({ insert })
    await awaitTransaction(tx)
  }

  async getStats(table?: string): Promise<
    | { totalTables: number; tables: Record<string, TableStats>; overallBytes: number }
    | TableStats
  > {
    this.ensureDb()
    const tx = this.db!.transaction([META_STATS_STORE], "readonly")
    const statsStore = tx.objectStore(META_STATS_STORE)

    if (table) {
      const entry = await requestToPromise<{ key: string; value: TableStats } | undefined>(statsStore.get(statsKeyFor(table)))
      const value: TableStats = entry?.value ?? { count: 0, totalBytes: 0 }
      return value
    }

    const tables: Record<string, TableStats> = {}
    const req = statsStore.openCursor()
    let overall = 0
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const key: string = (cursor.value as any).key
          const t = key.replace(/^stats:/, "")
          const value: TableStats = (cursor.value as any).value
          tables[t] = value
          overall += value.totalBytes
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => reject(req.error)
    })
    return { totalTables: Object.keys(tables).length, tables, overallBytes: overall }
  }

  subscribe(table: string, fn: Subscriber): () => void {
    if (!this.subscribers.has(table)) this.subscribers.set(table, new Set())
    this.subscribers.get(table)!.add(fn)
    return () => {
      this.subscribers.get(table)?.delete(fn)
    }
  }

  // Get strongly typed interface for this database
  typed<S extends Schema = Schema>(): TypedColumnistDB<S> {
    return {
      insert: <K extends keyof S>(record: Omit<InferTableType<S[K]>, "id">, table: K) => 
        this.insert(record as any, table as string),
      
      update: <K extends keyof S>(id: number, updates: Partial<Omit<InferTableType<S[K]>, "id">>, table: K) => 
        this.update(id, updates as any, table as string),
      
      find: <K extends keyof S>(options: Omit<FindOptions, "table"> & { table: K }) => 
        this.find({ ...options, table: options.table as string }) as Promise<InferTableType<S[K]>[]>,
      
      search: <K extends keyof S>(query: string, options: Omit<SearchOptions, "table"> & { table: K }) => 
        this.search(query, { ...options, table: options.table as string }) as Promise<(InferTableType<S[K]> & { score: number })[]>,
      
      getAll: <K extends keyof S>(table: K, limit?: number) => 
        this.getAll(table as string, limit) as Promise<InferTableType<S[K]>[]>,
      
      bulkInsert: <K extends keyof S>(records: Omit<InferTableType<S[K]>, "id">[], table: K) => 
        this.bulkInsert(records as any[], table as string),
      
      bulkUpdate: <K extends keyof S>(updates: Array<{ id: number; updates: Partial<Omit<InferTableType<S[K]>, "id">> }>, table: K) => 
        this.bulkUpdate(updates as any[], table as string),
      
      bulkDelete: <K extends keyof S>(ids: number[], table: K) => 
        this.bulkDelete(ids, table as string)
    }
  }

  // Sync methods
  getSyncManager(): SyncManager {
    if (!this.syncManager) {
      this.syncManager = new SyncManager(this)
    }
    return this.syncManager
  }

  // Device management methods
  async getDeviceManager(): Promise<import('./sync/device-utils').DeviceManager> {
    if (!(globalThis as any).__deviceManager) {
      const { getDeviceManager } = await import('./sync/device-utils');
      (globalThis as any).__deviceManager = getDeviceManager(this);
    }
    return (globalThis as any).__deviceManager;
  }

  async registerSyncAdapter(name: string, type: 'firebase' | 'supabase' | 'rest', options: any): Promise<void> {
    const { createSyncAdapter } = await import('./sync');
    const adapter = createSyncAdapter(this, type, { ...options, name });
    this.getSyncManager().registerAdapter(name, adapter);
  }

  async startSync(name?: string): Promise<void> {
    if (name) {
      const adapter = this.getSyncManager().getAdapter(name);
      if (adapter) {
        await adapter.start();
      }
    } else {
      await this.getSyncManager().startAll();
    }
  }

  stopSync(name?: string): void {
    if (name) {
      const adapter = this.getSyncManager().getAdapter(name);
      if (adapter) {
        adapter.stop();
      }
    } else {
      this.getSyncManager().stopAll();
    }
  }

  getSyncStatus(name?: string): any {
    if (name) {
      const adapter = this.getSyncManager().getAdapter(name);
      return adapter ? adapter.getStatus() : null;
    }
    return this.getSyncManager().getStatus();
  }

  /**
   * Track database changes for synchronization
   */
  private trackSyncChange(table: string, type: 'insert' | 'update' | 'delete', record: any): void {
    if (!this.syncManager) return;
    
    // Notify all registered adapters of the change
    for (const adapter of this.getSyncManager().getAllAdapters()) {
      adapter.trackChange(table, type, record);
    }
  }

  // Device management public methods
  async getCurrentDevice(): Promise<import('./sync/device-utils').DeviceInfo> {
    const deviceManager = await this.getDeviceManager();
    return deviceManager.getCurrentDevice();
  }

  async getAllDevices(): Promise<import('./sync/device-utils').DeviceInfo[]> {
    const deviceManager = await this.getDeviceManager();
    return deviceManager.getAllDevices();
  }

  async getOnlineDevices(): Promise<import('./sync/device-utils').DeviceInfo[]> {
    const deviceManager = await this.getDeviceManager();
    return deviceManager.getOnlineDevices();
  }

  async startDevicePresenceTracking(heartbeatInterval: number = 30000): Promise<void> {
    const deviceManager = await this.getDeviceManager();
    return deviceManager.startPresenceTracking(heartbeatInterval);
  }

  // Internal helpers
  private notify(table: string, event: ChangeEvent): void {
    const subs = this.subscribers.get(table)
    if (!subs) return
    for (const fn of subs) {
      try {
        fn(event)
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private ensureDb(): void {
    if (!this.db) throw new Error("Database not loaded. Call load() first.")
  }

  private ensureTable(table: string): TableDefinition {
    const def = this.schema[table]
    if (!def) throw new Error(`Table not found in schema: ${table}`)
    return def
  }

  private async collectAllIds(table: string): Promise<number[]> {
    this.ensureDb()
    const tx = this.db!.transaction([table], "readonly")
    const store = tx.objectStore(table)
    const req = store.openKeyCursor()
    const out: number[] = []
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          out.push(cursor.primaryKey as number)
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => reject(req.error)
    })
    return out
  }

  private passesFilters(record: Record<string, unknown>, filters: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(filters)) {
      if ((record as any)[k] !== v) return false
    }
    return true
  }

  private passesTimeRange(record: Record<string, unknown>, def: TableDefinition, start: number | null, end: number | null): boolean {
    if (start === null && end === null) return true
    // Attempt to use a conventional timestamp field if present
    const tsField = def.columns["timestamp"] ? "timestamp" : null
    if (!tsField) return true
    const value = record[tsField]
    if (!(value instanceof Date)) return true
    const t = value.getTime()
    if (start !== null && t < start) return false
    if (end !== null && t > end) return false
    return true
  }

  private allStoreNamesForTx(): string[] {
    // Include all table stores + meta and all inverted indexes
    const names = new Set<string>([META_SCHEMA_STORE, META_STATS_STORE])
    for (const table of Object.keys(this.schema)) {
      names.add(table)
      names.add(indexStoreName(table))
    }
    return Array.from(names)
  }

  private hasIndex(def: TableDefinition, field: string): boolean {
    // Primary key is always indexed
    if (field === (def.primaryKey || "id")) return true
    // Check secondary indexes
    return (def.secondaryIndexes || []).includes(field)
  }

  private buildKeyRange(condition: unknown): IDBKeyRange | undefined {
    if (condition === null || condition === undefined) return undefined
    
    if (typeof condition === "object" && condition !== null && !Array.isArray(condition) && !(condition instanceof Date)) {
      const cond = condition as Record<string, unknown>
      
      // Range queries
      if ("$gt" in cond || "$gte" in cond || "$lt" in cond || "$lte" in cond) {
        const lower = cond.$gte !== undefined ? cond.$gte : cond.$gt
        const upper = cond.$lte !== undefined ? cond.$lte : cond.$lt
        const lowerOpen = cond.$gte === undefined && cond.$gt !== undefined
        const upperOpen = cond.$lte === undefined && cond.$lt !== undefined
        
        if (lower !== undefined && upper !== undefined) {
          return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen)
        } else if (lower !== undefined) {
          return lowerOpen ? IDBKeyRange.lowerBound(lower, true) : IDBKeyRange.lowerBound(lower)
        } else if (upper !== undefined) {
          return upperOpen ? IDBKeyRange.upperBound(upper, true) : IDBKeyRange.upperBound(upper)
        }
      }
      
      // $in queries - use only() for single values, no direct support for multiple
      if ("$in" in cond && Array.isArray(cond.$in) && cond.$in.length === 1) {
        return IDBKeyRange.only(cond.$in[0])
      }
    } else {
      // Equality condition
      return IDBKeyRange.only(condition)
    }
    
    return undefined
  }

  private matchesWhere(record: Record<string, unknown>, where: WhereCondition): boolean {
    for (const [field, condition] of Object.entries(where)) {
      const value = record[field]
      
      if (!this.matchesCondition(value, condition)) {
        return false
      }
    }
    return true
  }

  private matchesCondition(value: unknown, condition: unknown): boolean {
    if (condition === null || condition === undefined) {
      return value === condition
    }
    
    if (typeof condition === "object" && condition !== null && !Array.isArray(condition) && !(condition instanceof Date)) {
      const cond = condition as Record<string, unknown>
      
      // Range conditions
      if ("$gt" in cond && !(value !== null && value !== undefined && value > cond.$gt!)) return false
      if ("$gte" in cond && !(value !== null && value !== undefined && value >= cond.$gte!)) return false
      if ("$lt" in cond && !(value !== null && value !== undefined && value < cond.$lt!)) return false
      if ("$lte" in cond && !(value !== null && value !== undefined && value <= cond.$lte!)) return false
      
      // $in condition
      if ("$in" in cond && Array.isArray(cond.$in)) {
        return cond.$in.includes(value)
      }
      
      return true
    } else {
      // Equality condition
      return value === condition
    }
  }
}

export const Columnist = {
  init: ColumnistDB.init.bind(ColumnistDB),
  getDB: ColumnistDB.getDB.bind(ColumnistDB),
}

export default Columnist


