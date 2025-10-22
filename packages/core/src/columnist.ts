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
import type { ColumnType, TableDefinition, InferTableType, ColumnistDBOptions } from "./types"
import { createTableCodec, dateCodec, jsonCodec } from "./codecs"

// Error recovery and resilience mechanisms
interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeout: number
  halfOpenTimeout: number
}

enum ErrorType {
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  STORAGE = 'storage',
  NETWORK = 'network'
}

class ErrorRecoveryManager {
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 5000,
    backoffMultiplier: 2
  }

  private circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    halfOpenTimeout: 30000 // 30 seconds
  }

  private failureCounts: Map<string, number> = new Map()
  private circuitStates: Map<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'> = new Map()
  private lastFailureTimes: Map<string, number> = new Map()

  classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase()

    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ErrorType.NETWORK
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('permission')) {
      return ErrorType.AUTHENTICATION
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('schema')) {
      return ErrorType.VALIDATION
    }
    if (message.includes('storage') || message.includes('indexeddb') || message.includes('quota')) {
      return ErrorType.STORAGE
    }
    if (message.includes('transient') || message.includes('retry') || message.includes('temporary')) {
      return ErrorType.TRANSIENT
    }

    return ErrorType.PERMANENT
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customConfig }
    let lastError: Error

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // Check circuit breaker
        if (!this.canProceed(operationName)) {
          throw new Error(`Circuit breaker is OPEN for operation: ${operationName}`)
        }

        const result = await operation()

        // Success - reset failure count
        this.recordSuccess(operationName)
        return result
      } catch (error) {
        lastError = error as Error
        const errorType = this.classifyError(lastError)

        // Don't retry permanent errors
        if (errorType === ErrorType.PERMANENT || errorType === ErrorType.VALIDATION) {
          throw lastError
        }

        // Record failure for circuit breaker
        this.recordFailure(operationName)

        // If this was the last attempt, throw the error
        if (attempt === config.maxRetries) {
          throw lastError
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        )

        await this.delay(delay)
      }
    }

    throw lastError!
  }

  private canProceed(operationName: string): boolean {
    const state = this.circuitStates.get(operationName) || 'CLOSED'
    const lastFailureTime = this.lastFailureTimes.get(operationName)

    if (state === 'OPEN') {
      if (lastFailureTime && Date.now() - lastFailureTime > this.circuitBreakerConfig.resetTimeout) {
        this.circuitStates.set(operationName, 'HALF_OPEN')
        return true
      }
      return false
    }

    if (state === 'HALF_OPEN') {
      // Allow one request to test if service is back
      this.circuitStates.set(operationName, 'OPEN')
      return true
    }

    return true // CLOSED state
  }

  private recordFailure(operationName: string): void {
    const currentCount = this.failureCounts.get(operationName) || 0
    const newCount = currentCount + 1
    this.failureCounts.set(operationName, newCount)
    this.lastFailureTimes.set(operationName, Date.now())

    if (newCount >= this.circuitBreakerConfig.failureThreshold) {
      this.circuitStates.set(operationName, 'OPEN')
    }
  }

  private recordSuccess(operationName: string): void {
    this.failureCounts.set(operationName, 0)
    this.circuitStates.set(operationName, 'CLOSED')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getRecoveryStrategy(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.TRANSIENT:
        return 'Retry with exponential backoff'
      case ErrorType.NETWORK:
        return 'Check connectivity and retry'
      case ErrorType.STORAGE:
        return 'Fallback to in-memory storage'
      case ErrorType.AUTHENTICATION:
        return 'Re-authenticate or refresh tokens'
      case ErrorType.VALIDATION:
        return 'Fix input data and retry'
      case ErrorType.PERMANENT:
        return 'Report to user and stop retrying'
      default:
        return 'Unknown error type'
    }
  }

  getStats(): {
    failureCounts: Record<string, number>
    circuitStates: Record<string, string>
  } {
    return {
      failureCounts: Object.fromEntries(this.failureCounts),
      circuitStates: Object.fromEntries(this.circuitStates)
    }
  }
}

// Zod schema mapping for column types
const ColumnTypeSchemas = {
  string: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  date: z.date(),
  json: z.unknown()
} as const

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

  // New method to create a codec for this table schema
  codec() {
    if (!this.def.validation && !this.def.columns) {
      throw new Error("Cannot create codec without schema definition")
    }
    
    const columnTypes = this.def.columns as Record<string, ColumnType>
    return createTableCodec(columnTypes, this.def.validation)
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

const SENSITIVE_FIELD_PATTERNS = [/password/i, /secret/i, /key/i, /token/i, /auth/i]

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

  // New methods for database operations
  add(storeName: string, value: any): number {
    const store = this.stores.get(storeName);
    if (!store) throw new Error(`Store ${storeName} not found`);

    // Auto-generate ID if not provided
    let id = value.id;
    if (id === undefined || id === null) {
      id = Date.now() + Math.floor(Math.random() * 1000);
    }

    store.data.set(id, { ...value, id });
    return id;
  }

  openCursor(storeName: string, callback: (cursor: { value: any; primaryKey: number | string; continue: () => void }) => void): void {
    const store = this.stores.get(storeName);
    if (!store) return;

    const entries = Array.from(store.data.entries());
    let index = 0;

    const processNext = () => {
      if (index < entries.length) {
        const [primaryKey, value] = entries[index];
        callback({
          value,
          primaryKey,
          continue: () => {
            index++;
            processNext();
          }
        });
      }
    };

    processNext();
  }

  openKeyCursor(storeName: string, callback: (cursor: { primaryKey: number | string; continue: () => void }) => void): void {
    const store = this.stores.get(storeName);
    if (!store) return;

    const keys = Array.from(store.data.keys());
    let index = 0;

    const processNext = () => {
      if (index < keys.length) {
        const primaryKey = keys[index];
        callback({
          primaryKey,
          continue: () => {
            index++;
            processNext();
          }
        });
      }
    };

    processNext();
  }

  count(storeName: string): number {
    const store = this.stores.get(storeName);
    return store ? store.data.size : 0;
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

// Helper functions for in-memory operations
function inMemoryRequestToPromise<T>(operation: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const result = operation();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

function inMemoryAwaitTransaction(): Promise<void> {
  return Promise.resolve(); // In-memory operations are synchronous
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

// HNSW index store name
function hnswStoreName(table: string): string {
  return `_hnsw_${table}`
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

  getOptions(): Readonly<ColumnistDBOptions>
}

export class ColumnistDBError extends Error {
  constructor(message: string, public code: string) {
    super(`[ColumnistDB] ${message} (code: ${code})`)
    this.name = 'ColumnistDBError'
  }
}

export class ColumnistDB<Schema extends SchemaDefinition = SchemaDefinition> {
  private name: string
  private version: number
  private schema: SchemaDefinition
  private db: IDBDatabase | null = null
  private subscribers: Map<string, Set<Subscriber>> = new Map()
  private vectorEmbedders: Map<string, (input: string) => Promise<Float32Array>> = new Map()
  private migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void>
  private vectorCache: Map<string, { vector: Float32Array; lastAccessed: number }> = new Map()
  private encryptionKey: CryptoKey | null = null
  private encryptionSalt: Uint8Array | null = null
  private authHooks: Map<string, (operation: string, table: string, data?: any) => boolean> = new Map()
  private authAttempts: Map<string, { count: number; lastAttempt: number }> = new Map()
  private syncManager: SyncManager | null = null
  private options: ColumnistDBOptions
  private useInMemory: boolean = false
  private inMemoryStorage: InMemoryStorage | null = null

  // Memory management configuration
  private memoryConfig = {
    maxVectorCacheSize: 1000,
    maxVectorEmbedders: 50,
    maxSubscribersPerTable: 100,
    maxAuthAttempts: 1000,
    cacheCleanupInterval: 5 * 60 * 1000, // 5 minutes
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    enableMemoryMonitoring: true
  }

  // Error recovery configuration
  private errorRecoveryConfig = {
    maxRetryAttempts: 3,
    retryDelay: 1000, // 1 second
    exponentialBackoff: true,
    enableAutoRecovery: true,
    maxRecoveryTime: 30000, // 30 seconds
    enableHealthChecks: true,
    healthCheckInterval: 60000, // 1 minute
    enableFallbackMode: true
  }

  // Production monitoring and metrics configuration
  private monitoringConfig = {
    enableMetrics: true,
    metricsCollectionInterval: 30000, // 30 seconds
    enablePerformanceTracking: true,
    enableUsageAnalytics: true,
    enableErrorTracking: true,
    enableResourceMonitoring: true,
    maxMetricsHistory: 1000,
    enableRealTimeStats: true
  }

  private metrics: {
    operationCounts: Map<string, number>
    operationTimings: Map<string, number[]>
    errorCounts: Map<string, number>
    memoryUsage: number[]
    performanceStats: {
      averageResponseTime: number
      throughput: number
      errorRate: number
      cacheHitRate: number
    }
    customMetrics: Map<string, any>
  } = {
    operationCounts: new Map(),
    operationTimings: new Map(),
    errorCounts: new Map(),
    memoryUsage: [],
    performanceStats: {
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      cacheHitRate: 0
    },
    customMetrics: new Map()
  }

  private metricsInterval: NodeJS.Timeout | null = null
  private lastMetricsUpdate: number = Date.now()

  private cleanupInterval: NodeJS.Timeout | null = null
  private lastMemoryCheck: number = 0
  private healthCheckInterval: NodeJS.Timeout | null = null
  private errorState: {
    isDegraded: boolean
    lastError: Error | null
    errorCount: number
    recoveryInProgress: boolean
    fallbackMode: boolean
  } = {
    isDegraded: false,
    lastError: null,
    errorCount: 0,
    recoveryInProgress: false,
    fallbackMode: false
  }

  private errorRecoveryManager: ErrorRecoveryManager = new ErrorRecoveryManager()

  private constructor(name: string, schema: SchemaDefinition, version: number, options: ColumnistDBOptions, migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void>) {
    this.name = name
    this.schema = schema
    this.version = version
    this.migrations = migrations
    this.options = options
    // Sync manager will be initialized lazily when needed
    this.syncManager = null

    // Initialize memory management if enabled
    if (this.memoryConfig.enableMemoryMonitoring && typeof global !== 'undefined') {
      this.startMemoryManagement()
    }

    // Initialize error recovery if enabled
    if (this.errorRecoveryConfig.enableHealthChecks && typeof global !== 'undefined') {
      this.startErrorRecovery()
    }
  }

  static #instance: ColumnistDB | null = null

  static async init(name: string, opts?: ColumnistDBOptions & { schema?: SchemaDefinition; migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void> }): Promise<ColumnistDB> {
    const useInMemory = !isClientIndexedDBAvailable();
    
    if (useInMemory) {
      console.warn("IndexedDB not available. Falling back to in-memory storage. Data will not persist.");
    }

    // Merge provided tables with default schema
    const providedSchema = opts?.schema || opts?.tables || {}
    const schema: SchemaDefinition = {
      ...providedSchema,
      ...(opts?.autoInitialize !== false ? {
        [DEFAULT_TABLE]: {
          columns: { id: "number", user_id: "number", message: "string", timestamp: "date" },
          primaryKey: "id",
          searchableFields: ["message"],
          secondaryIndexes: ["user_id", "timestamp"],
        }
      } : {})
    }
    
    const version = opts?.version ?? 1

    const defaultOptions: ColumnistDBOptions = {
      databaseName: name,
      ...opts
    };
    const instance = new ColumnistDB(name, schema, version, defaultOptions, opts?.migrations)

    const syncEnabled = opts?.sync?.enabled === true

    if (syncEnabled && opts?.sync?.autoRegisterDevices !== false) {
      instance.ensureDeviceTableSchema()
    }

    await instance.load()

    // Initialize encryption if key provided
    if (opts?.encryptionKey) {
      await instance.setEncryptionKey(opts.encryptionKey)
    }

    // Auto-initialize device tables if sync is enabled
    if (syncEnabled && opts?.sync?.autoRegisterDevices !== false) {
      await instance.ensureDeviceTables()
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

  getOptions(): Readonly<ColumnistDBOptions> {
    const cloned: ColumnistDBOptions = {
      ...this.options,
      sync: this.options.sync ? { ...this.options.sync } : undefined,
      vectorSearch: this.options.vectorSearch ? { ...this.options.vectorSearch } : undefined,
      tables: this.options.tables ? { ...this.options.tables } : undefined
    }

    return Object.freeze(cloned)
  }

  private ensureDeviceTableSchema(): void {
    if (this.schema.devices) {
      return
    }

    this.schema = {
      ...this.schema,
      devices: DeviceTableSchema
    }
  }

  private async ensureDeviceTables(): Promise<void> {
    if (!this.schema.devices) {
      return
    }

    if (this.useInMemory) {
      this.inMemoryStorage?.createStore('devices')
      this.inMemoryStorage?.createStore(indexStoreName('devices'))
      return
    }

    if (!this.db) {
      return
    }

    if (this.db.objectStoreNames.contains('devices')) {
      return
    }

    this.db.close()
    this.version += 1
    await this.load()
  }

  async load(): Promise<void> {
    if (!isClientIndexedDBAvailable()) {
      // Fall back to in-memory storage when IndexedDB is unavailable
      console.warn("IndexedDB not available. Falling back to in-memory storage. Data will not persist.")
      this.useInMemory = true
      this.inMemoryStorage = getInMemoryStorage()

      // Initialize in-memory stores for all tables
      for (const table of Object.keys(this.schema)) {
        this.inMemoryStorage.createStore(table)
        this.inMemoryStorage.createStore(indexStoreName(table))
        this.inMemoryStorage.createStore(vectorStoreName(table))
        this.inMemoryStorage.createStore(ivfStoreName(table))
      }
      this.inMemoryStorage.createStore(META_SCHEMA_STORE)
      this.inMemoryStorage.createStore(META_STATS_STORE)

      return
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

          // Create HNSW index store for modern ANN search
          const hnsw = hnswStoreName(table)
          if (!db.objectStoreNames.contains(hnsw)) {
            db.createObjectStore(hnsw, { keyPath: "layer" })
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

  // Validation helpers with codec support
  private validateRecord(record: Record<string, unknown>, def: TableDefinition): Record<string, unknown> {
    // Auto-generate schema from column definitions if no custom validation
    if (!def.validation) {
      const autoSchema = this.generateAutoSchema(def)
      const result = autoSchema.safeParse(record)
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`)
      }
      return result.data as Record<string, unknown>
    }

    // Use custom validation schema with codec support if available
    if (def.validation && '_def' in def.validation && typeof (def.validation as any)._def.transform === 'function') {
      // This is a codec, use parse method for validation (decoding)
      try {
        return def.validation.parse(record) as Record<string, unknown>
      } catch (error) {
        throw new Error(`Validation failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Use traditional validation schema
    const result = def.validation.safeParse(record)
    if (!result.success) {
      throw new Error(`Validation failed: ${result.error.message}`)
    }
    return result.data as Record<string, unknown>
  }

  private generateAutoSchema(def: TableDefinition): z.ZodSchema {
    const shape: Record<string, z.ZodTypeAny> = {}
    
    for (const [column, type] of Object.entries(def.columns)) {
      let schema: z.ZodTypeAny
      
      if (typeof type === 'object' && type.type === 'vector') {
        schema = z.instanceof(Float32Array)
      } else {
        schema = ColumnTypeSchemas[type as ColumnType]
      }
      
      // Make id optional for inserts (auto-generated)
      if (column === (def.primaryKey || "id")) {
        schema = schema.optional() as any
      }
      
      shape[column] = schema
    }
    
    return z.object(shape)
  }

  // Encode record for storage using codec if available
  private encodeRecordForStorage(record: Record<string, unknown>, def: TableDefinition): Record<string, unknown> {
    if (def.validation && '_def' in def.validation && typeof (def.validation as any)._def.reverseTransform === 'function') {
      // Use codec reverseTransform method for storage transformation (encoding)
      try {
        return (def.validation as any)._def.reverseTransform(record)
      } catch (error) {
        throw new Error(`Encoding failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    // Fallback to manual normalization
    const normalized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      const colType = def.columns[k]
      if (typeof colType === 'object' && colType.type === 'vector' && v instanceof Float32Array) {
        // Convert Float32Array to Array for storage
        normalized[k] = Array.from(v)
      } else if (colType === "date") {
        normalized[k] = toISO(v)
      } else {
        normalized[k] = v
      }
    }
    return normalized
  }

  // Decode record from storage format using codec if available
  private decodeRecordFromStorage(record: Record<string, unknown>, def: TableDefinition): Record<string, unknown> {
    if (def.validation && '_def' in def.validation && typeof (def.validation as any)._def.transform === 'function') {
      // Use codec parse method for application transformation (decoding)
      try {
        return def.validation.parse(record) as Record<string, unknown>
      } catch (error) {
        throw new Error(`Decoding failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    // Fallback to manual denormalization
    const denormalized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      const colType = def.columns[k]
      if (typeof colType === 'object' && colType.type === 'vector' && Array.isArray(v)) {
        // Convert Array back to Float32Array
        denormalized[k] = new Float32Array(v)
      } else if (colType === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) {
        denormalized[k] = new Date(v)
      } else if (colType === "json" && typeof v === "string" && 
                ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']')))) {
        try {
          denormalized[k] = JSON.parse(v)
        } catch {
          denormalized[k] = v
        }
      } else {
        denormalized[k] = v
      }
    }
    return denormalized
  }

  // Insert record into a table
  async update<T extends Record<string, unknown>>(id: number, updates: Partial<T>, table?: string): Promise<void> {
    this.ensureDb()
    const tableName = table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)

    // Check authentication with rate limiting
    if (!this.checkAuthWithRateLimit('update', tableName, { id, ...updates })) {
      throw new Error('Update operation not authorized')
    }

    // Handle in-memory storage
    if (this.useInMemory) {
      return this.updateInMemory(id, updates as Record<string, unknown>, tableName, def);
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

    // Normalize updates for storage using codec if available
    const normalizedUpdates = this.encodeRecordForStorage(updates as Record<string, unknown>, def)

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

    // Check authentication with rate limiting
    if (!this.checkAuthWithRateLimit('delete', tableName, { id })) {
      throw new Error('Delete operation not authorized')
    }

    // Handle in-memory storage
    if (this.useInMemory) {
      return this.deleteInMemory(id, tableName, def);
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
        // Check authentication with rate limiting
        if (!this.checkAuthWithRateLimit('insert', tableName, record)) {
          throw new Error('Insert operation not authorized')
        }
        
        // Validate record
        const validatedRecord = this.validateRecord(record, def)
        
        // Encrypt sensitive fields
        const encryptedRecord = await this.encryptSensitiveFields(validatedRecord, def)
        
        // Normalize for storage using codec if available
        const normalized = this.encodeRecordForStorage(encryptedRecord, def)
        
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
    const tableName = table || DEFAULT_TABLE

    // Use error recovery with graceful degradation
    return await this.withErrorRecovery(
      async () => {
        this.ensureDb()
        const def = this.ensureTable(tableName)

        // Check authentication with rate limiting
        if (!this.checkAuthWithRateLimit('insert', tableName, record)) {
          throw new Error('Insert operation not authorized')
        }

        // Handle in-memory storage
        if (this.useInMemory) {
          return this.insertInMemory(record, tableName, def);
        }

        // Original IndexedDB implementation
        // Validate record
        const validatedRecord = this.validateRecord(record, def)

        // Encrypt sensitive fields before storage
        const encryptedRecord = await this.encryptSensitiveFields(validatedRecord, def)

        // Normalize record for storage using codec if available
        const normalized = this.encodeRecordForStorage(encryptedRecord, def)

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
      },
      'insert',
      async () => {
        // Fallback to in-memory storage
        console.warn('Falling back to in-memory storage for insert operation')
        const def = this.ensureTable(tableName)
        return await this.insertInMemory(record, tableName, def)
      }
    )
  }

  // In-memory implementation of insert
  private async insertInMemory<T extends Record<string, unknown>>(
    record: T,
    tableName: string,
    def: TableDefinition
  ): Promise<InsertResult> {
    // Validate record
    const validatedRecord = this.validateRecord(record, def)

    // Encrypt sensitive fields before storage
    const encryptedRecord = await this.encryptSensitiveFields(validatedRecord, def)

    // Normalize record for storage using codec if available
    const normalized = this.encodeRecordForStorage(encryptedRecord, def)

    // Insert into main table
    const id = this.inMemoryStorage!.add(tableName, normalized)

    // Build/update inverted index for searchable fields
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    const iiStoreName = indexStoreName(tableName)
    const tokens = new Set<string>()
    for (const field of searchable) {
      const raw = (record as any)[field]
      if (typeof raw === "string") {
        for (const tok of tokenize(raw)) tokens.add(tok)
      }
    }

    for (const token of tokens) {
      const existing = this.inMemoryStorage!.get(iiStoreName, token)
      if (existing) {
        if (!existing.ids.includes(id)) existing.ids.push(id)
        this.inMemoryStorage!.put(iiStoreName, token, existing)
      } else {
        this.inMemoryStorage!.put(iiStoreName, token, { token, ids: [id] })
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
          const vStoreName = vectorStoreName(tableName)
          this.inMemoryStorage!.put(vStoreName, id, { id, vector: Array.from(vec) })
        }
      }
    }

    // Update stats
    const statsKey = statsKeyFor(tableName)
    const prev = this.inMemoryStorage!.get(META_STATS_STORE, statsKey)
    const bytes = JSON.stringify(normalized).length
    const nextStats: TableStats = {
      count: (prev?.value.count ?? 0) + 1,
      totalBytes: (prev?.value.totalBytes ?? 0) + bytes,
    }
    this.inMemoryStorage!.put(META_STATS_STORE, statsKey, { key: statsKey, value: nextStats })

    // Notify subscribers
    this.notify(tableName, { table: tableName, type: "insert", record: { ...(record as any), id } })

    // Track change for synchronization
    this.trackSyncChange(tableName, 'insert', { ...(record as any), id })

    return { id }
  }

  async getAll<T = unknown>(table: string, limit = 1000): Promise<(T & { id: number })[]> {
    this.ensureDb()
    const def = this.ensureTable(table)

    // Check authentication with rate limiting
    if (!this.checkAuthWithRateLimit('read', table)) {
      throw new Error('Read operation not authorized')
    }

    // Handle in-memory storage
    if (this.useInMemory) {
      return this.getAllInMemory(table, def, limit);
    }

    // Original IndexedDB implementation
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
          // Decode from storage format using codec if available
          const decodedValue = this.decodeRecordFromStorage(decryptedValue, def)
          out.push(decodedValue as T & { id: number })

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

  // In-memory implementation of getAll
  private async getAllInMemory<T = unknown>(
    table: string,
    def: TableDefinition,
    limit: number
  ): Promise<(T & { id: number })[]> {
    const out: (T & { id: number })[] = []
    let count = 0

    this.inMemoryStorage!.openCursor(table, async (cursor) => {
      const value: any = cursor.value
      value.id = cursor.primaryKey as number

      // Decrypt sensitive fields after retrieval
      const decryptedValue = await this.decryptSensitiveFields(value, def)
      // Decode from storage format using codec if available
      const decodedValue = this.decodeRecordFromStorage(decryptedValue, def)
      out.push(decodedValue as T & { id: number })

      count++
      if (count >= limit) {
        return
      }
      cursor.continue()
    })

    return out
  }

  // In-memory implementation of update
  private async updateInMemory(
    id: number,
    updates: Record<string, unknown>,
    tableName: string,
    def: TableDefinition
  ): Promise<void> {
    // Get the existing record
    const existing = this.inMemoryStorage!.get(tableName, id)
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

    // Normalize updates for storage using codec if available
    const normalizedUpdates = this.encodeRecordForStorage(updates, def)

    // Merge updates into existing record
    const updated = { ...existing, ...normalizedUpdates }
    this.inMemoryStorage!.put(tableName, id, updated)

    // Update inverted index - remove old tokens, add new ones
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    const iiStoreName = indexStoreName(tableName)

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
      const entry = this.inMemoryStorage!.get(iiStoreName, token)
      if (entry) {
        entry.ids = entry.ids.filter((recordId: number) => recordId !== id)
        if (entry.ids.length === 0) {
          this.inMemoryStorage!.delete(iiStoreName, token)
        } else {
          this.inMemoryStorage!.put(iiStoreName, token, entry)
        }
      }
    }

    // Add id to new tokens
    const addedTokens = new Set([...newTokens].filter(tok => !oldTokens.has(tok)))
    for (const token of addedTokens) {
      const entry = this.inMemoryStorage!.get(iiStoreName, token)
      if (entry) {
        if (!entry.ids.includes(id)) {
          entry.ids.push(id)
          this.inMemoryStorage!.put(iiStoreName, token, entry)
        }
      } else {
        this.inMemoryStorage!.put(iiStoreName, token, { token, ids: [id] })
      }
    }

    // Update stats
    const statsKey = statsKeyFor(tableName)
    const prev = this.inMemoryStorage!.get(META_STATS_STORE, statsKey)
    if (prev) {
      const oldBytes = JSON.stringify(existing).length
      const newBytes = JSON.stringify(updated).length
      const byteDiff = newBytes - oldBytes
      const nextStats: TableStats = {
        count: prev.value.count, // Count stays the same
        totalBytes: prev.value.totalBytes + byteDiff,
      }
      this.inMemoryStorage!.put(META_STATS_STORE, statsKey, { key: statsKey, value: nextStats })
    }

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

  // In-memory implementation of delete
  private async deleteInMemory(
    id: number,
    tableName: string,
    def: TableDefinition
  ): Promise<void> {
    // Get the existing record before deletion
    const existing = this.inMemoryStorage!.get(tableName, id)
    if (!existing) {
      throw new Error(`Record with id ${id} not found in table ${tableName}`)
    }

    // Delete the record
    this.inMemoryStorage!.delete(tableName, id)

    // Remove from inverted index
    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    const iiStoreName = indexStoreName(tableName)
    const tokens = new Set<string>()

    for (const field of searchable) {
      const raw = existing[field]
      if (typeof raw === "string") {
        for (const tok of tokenize(raw)) tokens.add(tok)
      }
    }

    // Remove id from all tokens
    for (const token of tokens) {
      const entry = this.inMemoryStorage!.get(iiStoreName, token)
      if (entry) {
        entry.ids = entry.ids.filter((recordId: number) => recordId !== id)
        if (entry.ids.length === 0) {
          this.inMemoryStorage!.delete(iiStoreName, token)
        } else {
          this.inMemoryStorage!.put(iiStoreName, token, entry)
        }
      }
    }

    // Remove any vector entry
    if (def.vector) {
      const vStoreName = vectorStoreName(tableName)
      try {
        this.inMemoryStorage!.delete(vStoreName, id)
      } catch {}
    }

    // Update stats
    const statsKey = statsKeyFor(tableName)
    const prev = this.inMemoryStorage!.get(META_STATS_STORE, statsKey)
    if (prev) {
      const bytes = JSON.stringify(existing).length
      const nextStats: TableStats = {
        count: prev.value.count - 1,
        totalBytes: Math.max(0, prev.value.totalBytes - bytes),
      }
      this.inMemoryStorage!.put(META_STATS_STORE, statsKey, { key: statsKey, value: nextStats })
    }

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

  // In-memory implementation of find
  private async findInMemory<T = any>(
    options: FindOptions,
    tableName: string,
    def: TableDefinition
  ): Promise<(T & { id: number })[]> {
    const limit = options.limit || 1000
    const offset = options.offset || 0
    const where = options.where || {}

    // Get all records from the table
    const allRecords = await this.getAllInMemory<T>(tableName, def, Number.MAX_SAFE_INTEGER)

    // Apply where conditions
    let filtered = allRecords.filter(record => this.matchesWhere(record, where))

    // Apply ordering
    if (options.orderBy) {
      let orderField: string
      let orderDirection: "asc" | "desc" = "asc"

      if (typeof options.orderBy === "string") {
        orderField = options.orderBy
      } else {
        orderField = options.orderBy.field
        orderDirection = options.orderBy.direction || "asc"
      }

      filtered.sort((a, b) => {
        const aVal = (a as any)[orderField]
        const bVal = (b as any)[orderField]
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return orderDirection === "desc" ? -comparison : comparison
      })
    }

    // Apply offset and limit
    const result = filtered.slice(offset, offset + limit)
    return result
  }

  // In-memory implementation of search
  private async searchInMemory<T = any>(
    query: string,
    options: SearchOptions,
    tableName: string,
    def: TableDefinition
  ): Promise<(T & { id: number; score: number })[]> {
    const limit = typeof options.limit === "number" ? options.limit : 50
    const tokens = tokenize(query)

    // Get stats for IDF calculation
    const statsKey = statsKeyFor(tableName)
    const statsEntry = this.inMemoryStorage!.get(META_STATS_STORE, statsKey)
    const totalDocs = statsEntry?.value.count ?? 0

    const idToScore = new Map<number, number>()
    const iiStoreName = indexStoreName(tableName)

    // Calculate TF-IDF scores
    for (const tok of tokens) {
      const entry = this.inMemoryStorage!.get(iiStoreName, tok)
      const ids = entry?.ids || []
      const df = ids.length || 1
      const idf = Math.log((totalDocs + 1) / df)
      for (const id of ids) {
        idToScore.set(id, (idToScore.get(id) || 0) + idf)
      }
    }

    // Convert equality filters from options
    const reserved = new Set(["table", "limit", "timeRange"]) as Set<string>
    const equalityFilters: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(options)) {
      if (!reserved.has(k)) equalityFilters[k] = v
    }

    // Handle time range
    const range = options.timeRange
    let start: number | null = null
    let end: number | null = null
    if (range) {
      const s = range[0] instanceof Date ? (range[0] as Date) : new Date(range[0] as string)
      const e = range[1] instanceof Date ? (range[1] as Date) : new Date(range[1] as string)
      start = s.getTime()
      end = e.getTime()
    }

    // Get candidate IDs
    const candidateIds = idToScore.size > 0 ? Array.from(idToScore.keys()) :
      Array.from(this.inMemoryStorage!.getAll(tableName).map((record: any) => record.id))

    const results: (T & { id: number; score: number })[] = []

    // Process all candidate records
    for (const id of candidateIds) {
      const record = this.inMemoryStorage!.get(tableName, id)
      if (!record) continue

      // Decode record
      const decodedRecord = this.decodeRecordFromStorage(record, def)

      if (this.passesFilters(decodedRecord, equalityFilters) &&
          this.passesTimeRange(decodedRecord, def, start, end)) {
        const score = idToScore.get(id) || 0
        results.push({ ...(decodedRecord as T), score, id })
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  // In-memory implementation of vector search
  private async vectorSearchInMemory<T = any>(
    table: string,
    inputVector: Float32Array,
    opts?: { metric?: "cosine" | "dot" | "euclidean"; limit?: number; where?: WhereCondition }
  ): Promise<(T & { id: number; score: number })[]> {
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)
    if (inputVector.length !== def.vector.dims) throw new Error(`Vector dimension mismatch. Expected ${def.vector.dims}`)

    const limit = opts?.limit ?? 50
    const metric = opts?.metric ?? "cosine"

    const vStoreName = vectorStoreName(table)
    const inputNorm = metric === "cosine" ? norm(inputVector) : 1
    const results: { id: number; score: number }[] = []

    // Get all vectors from in-memory storage
    const allVectors = this.inMemoryStorage!.getAll(vStoreName)

    // Calculate similarity scores for all vectors
    for (const vecEntry of allVectors) {
      const { id, vector } = vecEntry
      const v = new Float32Array(vector)
      let score = 0

      if (metric === "cosine") score = dot(inputVector, v) / (inputNorm * norm(v) || 1)
      else if (metric === "dot") score = dot(inputVector, v)
      else if (metric === "euclidean") score = -euclideanDistance(inputVector, v)

      results.push({ id, score })
    }

    // Sort by score and take top results
    results.sort((a, b) => b.score - a.score)
    const topResults = results.slice(0, limit * 2) // Get more than needed for filtering

    // Fetch records and apply where filters
    const out: (T & { id: number; score: number })[] = []
    for (const { id, score } of topResults) {
      const record = this.inMemoryStorage!.get(table, id)
      if (!record) continue

      // Decode record
      const decodedRecord = this.decodeRecordFromStorage(record, def)

      // Apply where filters if specified
      if (opts?.where && !this.matchesWhere(decodedRecord, opts.where)) continue

      out.push({ ...(decodedRecord as T), id, score })

      if (out.length >= limit) break
    }

    return out.slice(0, limit)
  }

  // In-memory implementation of bulk operations
  private async bulkInsertInMemory<T extends Record<string, unknown>>(
    records: T[],
    tableName: string,
    def: TableDefinition
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = { success: 0, errors: [] }

    if (records.length === 0) {
      return result
    }

    const searchable = (def.searchableFields && def.searchableFields.length > 0)
      ? def.searchableFields
      : Object.entries(def.columns)
          .filter(([, t]) => t === "string")
          .map(([name]) => name)

    for (const record of records) {
      try {
        // Check authentication with rate limiting
        if (!this.checkAuthWithRateLimit('insert', tableName, record)) {
          throw new Error('Insert operation not authorized')
        }

        // Validate record
        const validatedRecord = this.validateRecord(record, def)

        // Encrypt sensitive fields
        const encryptedRecord = await this.encryptSensitiveFields(validatedRecord, def)

        // Normalize for storage using codec if available
        const normalized = this.encodeRecordForStorage(encryptedRecord, def)

        // Insert into main table
        const id = this.inMemoryStorage!.add(tableName, normalized)

        // Build inverted index
        const tokens = new Set<string>()
        for (const field of searchable) {
          const raw = (record as any)[field]
          if (typeof raw === "string") {
            for (const tok of tokenize(raw)) tokens.add(tok)
          }
        }

        const iiStoreName = indexStoreName(tableName)
        for (const token of tokens) {
          const existing = this.inMemoryStorage!.get(iiStoreName, token)
          if (existing) {
            if (!existing.ids.includes(id)) existing.ids.push(id)
            this.inMemoryStorage!.put(iiStoreName, token, existing)
          } else {
            this.inMemoryStorage!.put(iiStoreName, token, { token, ids: [id] })
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
              const vStoreName = vectorStoreName(tableName)
              this.inMemoryStorage!.put(vStoreName, id, { id, vector: Array.from(vec) })
            }
          }
        }

        // Update stats
        const statsKey = statsKeyFor(tableName)
        const prev = this.inMemoryStorage!.get(META_STATS_STORE, statsKey)
        const bytes = JSON.stringify(normalized).length
        const nextStats: TableStats = {
          count: (prev?.value.count ?? 0) + 1,
          totalBytes: (prev?.value.totalBytes ?? 0) + bytes,
        }
        this.inMemoryStorage!.put(META_STATS_STORE, statsKey, { key: statsKey, value: nextStats })

        result.success++

        // Notify subscribers
        this.notify(tableName, { table: tableName, type: "insert", record: { ...(record as any), id } })
        this.trackSyncChange(tableName, 'insert', { ...(record as any), id })

      } catch (error) {
        result.errors.push({ error: error as Error, record })
      }
    }

    return result
  }

  // In-memory implementation of bulk update
  private async bulkUpdateInMemory<T extends Record<string, unknown>>(
    updates: Array<{ id: number; updates: Partial<T> }>,
    tableName: string,
    def: TableDefinition
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = { success: 0, errors: [] }

    if (updates.length === 0) {
      return result
    }

    for (const { id, updates: updateData } of updates) {
      try {
        await this.updateInMemory(id, updateData as Record<string, unknown>, tableName, def)
        result.success++
      } catch (error) {
        result.errors.push({ error: error as Error, record: { id, updates: updateData } })
      }
    }

    return result
  }

  // In-memory implementation of bulk delete
  private async bulkDeleteInMemory(
    ids: number[],
    tableName: string,
    def: TableDefinition
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = { success: 0, errors: [] }

    if (ids.length === 0) {
      return result
    }

    for (const id of ids) {
      try {
        await this.deleteInMemory(id, tableName, def)
        result.success++
      } catch (error) {
        result.errors.push({ error: error as Error, record: { id } })
      }
    }

    return result
  }

  async find<T = any>(options: FindOptions = {}): Promise<(T & { id: number })[]> {
    this.ensureDb()
    const tableName = options.table || DEFAULT_TABLE
    const def = this.ensureTable(tableName)

    // Check authentication with rate limiting
    if (!this.checkAuthWithRateLimit('read', tableName)) {
      throw new Error('Read operation not authorized')
    }

    // Handle in-memory storage
    if (this.useInMemory) {
      return this.findInMemory<T>(options, tableName, def);
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
          record.id = id

          // Decrypt sensitive fields
          const decryptedRecord = await this.decryptSensitiveFields(record, def)
          // Decode from storage format using codec if available
          const decodedRecord = this.decodeRecordFromStorage(decryptedRecord, def)

          // Apply remaining where conditions
          if (this.matchesWhere(decodedRecord, where)) {
            if (skipped >= offset) {
              results.push(decodedRecord as T & { id: number })
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
          record.id = id

          // Decrypt sensitive fields
          const decryptedRecord = await this.decryptSensitiveFields(record, def)
          // Decode from storage format using codec if available
          const decodedRecord = this.decodeRecordFromStorage(decryptedRecord, def)

          // Apply where conditions
          if (this.matchesWhere(decodedRecord, where)) {
            if (skipped >= offset) {
              results.push(decodedRecord as T & { id: number })
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
    // Use optimized search for better performance
    return this.searchOptimized<T>(query, options)
  }

  // Optimized search implementation with batch processing
  private async searchOptimized<T = any>(query: string, options: SearchOptions = {}): Promise<(T & { id: number; score: number })[]> {
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

    // Process records in batches within a single transaction for optimal performance
    const batchSize = 100
    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batchIds = candidateIds.slice(i, i + batchSize)

      // Use a single transaction for each batch
      const batchTx = this.db!.transaction([table], "readonly")
      const batchStore = batchTx.objectStore(table)

      // Process all records in the current batch
      for (const id of batchIds) {
        const rec: any = await requestToPromise(batchStore.get(id))
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

      // Wait for batch transaction to complete before starting next
      await awaitTransaction(batchTx)
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

    // Check security configuration
    if (!this.encryptionKey) {
      issues.push('No encryption key configured - sensitive data may be stored in plain text')
      recommendations.push('Set an encryption key using setEncryptionKey() method')
    }

    // Check for rate limiting configuration
    if (this.authHooks.size === 0) {
      issues.push('No authentication hooks configured - all operations are allowed')
      recommendations.push('Implement authentication hooks for sensitive operations')
    }

    // Check for weak encryption settings
    if (this.encryptionSalt && this.encryptionSalt.length < 16) {
      issues.push('Encryption salt is too short - consider using at least 16 bytes')
      recommendations.push('Use longer salt values for better security')
    }

    // Check memory management configuration
    if (!this.memoryConfig.enableMemoryMonitoring) {
      issues.push('Memory monitoring is disabled - potential memory leaks may go undetected')
      recommendations.push('Enable memory monitoring for better memory management')
    }

    // Check cache sizes
    const memoryStats = this.getMemoryStats()
    if (memoryStats.memoryPressure) {
      issues.push('Memory pressure detected - consider reducing cache sizes or enabling aggressive cleanup')
      recommendations.push('Configure memory management settings to handle current workload')
    }

    return { issues, recommendations }
  }

  // Encryption methods
  async setEncryptionKey(key: string, salt?: Uint8Array): Promise<void> {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not available in this environment')
    }

    // Validate key strength
    if (key.length < 8) {
      throw new Error('Encryption key must be at least 8 characters long')
    }

    // Generate random salt if not provided
    const finalSalt = salt || window.crypto.getRandomValues(new Uint8Array(16))

    // Store salt for later use in key rotation
    this.encryptionSalt = finalSalt

    this.encryptionKey = await this.deriveEncryptionKey(key, finalSalt)
  }

  private async encryptData(data: string): Promise<string> {
    if (!this.encryptionKey) return data

    return this.encryptDataWithKey(data, this.encryptionKey)
  }

  private async encryptDataWithKey(data: string, key: CryptoKey): Promise<string> {
    try {
      const encoder = new TextEncoder()
      const iv = window.crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encoder.encode(data)
      )

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength)
      combined.set(iv)
      combined.set(new Uint8Array(encrypted), iv.length)

      return btoa(String.fromCharCode(...combined))
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) return encryptedData

    return this.decryptDataWithKey(encryptedData, this.encryptionKey)
  }

  private async decryptDataWithKey(encryptedData: string, key: CryptoKey): Promise<string> {
    try {
      // Validate encrypted data format
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Invalid encrypted data format')
      }

      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)))

      // Validate minimum length (IV + at least 1 byte of data)
      if (combined.length < 13) {
        throw new Error('Invalid encrypted data: too short')
      }

      const iv = combined.slice(0, 12)
      const data = combined.slice(12)

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        data
      )

      return new TextDecoder().decode(decrypted)
    } catch (error) {
      // Don't return original data on decryption failure - this is insecure
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Key rotation method
  async rotateEncryptionKey(newKey: string): Promise<void> {
    if (!this.encryptionKey || !this.encryptionSalt) {
      throw new Error('No current encryption key set')
    }

    const newSalt = window.crypto.getRandomValues(new Uint8Array(16))
    const oldKey = this.encryptionKey
    const oldSalt = this.encryptionSalt

    try {
      const derivedNewKey = await this.deriveEncryptionKey(newKey, newSalt)
      await this.reencryptSensitiveData(oldKey, derivedNewKey)
      this.encryptionKey = derivedNewKey
      this.encryptionSalt = newSalt
    } catch (error) {
      this.encryptionKey = oldKey
      this.encryptionSalt = oldSalt
      throw new Error(`Key rotation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async deriveEncryptionKey(key: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      'PBKDF2',
      false,
      ['deriveKey']
    )

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(salt).buffer,
        iterations: 310000,
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

  private async reencryptSensitiveData(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
    const tables = Object.entries(this.schema)
      .filter(([, def]) => this.tableHasSensitiveFields(def))

    if (tables.length === 0) {
      return
    }

    if (this.useInMemory) {
      await this.reencryptInMemoryStores(tables, oldKey, newKey)
      return
    }

    this.ensureDb()

    for (const [tableName, def] of tables) {
      const tx = this.db!.transaction([tableName], 'readwrite')
      const store = tx.objectStore(tableName)

      await new Promise<void>((resolve, reject) => {
        const cursorRequest = store.openCursor()
        cursorRequest.onerror = () => reject(cursorRequest.error)
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) {
            resolve()
            return
          }

          const record = cursor.value as Record<string, unknown>
          ;(async () => {
            try {
              const decrypted = await this.decryptSensitiveFieldsWithKey(record, oldKey)
              const reencrypted = await this.encryptSensitiveFieldsWithKey(decrypted, newKey)
              await requestToPromise(cursor.update(reencrypted as any))
              cursor.continue()
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)))
            }
          })()
        }
      })

      await awaitTransaction(tx)
    }
  }

  private async reencryptInMemoryStores(
    tables: Array<[string, TableDefinition]>,
    oldKey: CryptoKey,
    newKey: CryptoKey
  ): Promise<void> {
    if (!this.inMemoryStorage) return

    for (const [tableName, def] of tables) {
      const updates: Array<{ primaryKey: number | string; value: Record<string, unknown> }> = []

      this.inMemoryStorage.openCursor(tableName, (cursor) => {
        updates.push({ primaryKey: cursor.primaryKey, value: { ...(cursor.value as Record<string, unknown>) } })
        cursor.continue()
      })

      for (const { primaryKey, value } of updates) {
        const decrypted = await this.decryptSensitiveFieldsWithKey(value, oldKey)
        const reencrypted = await this.encryptSensitiveFieldsWithKey(decrypted, newKey)
        this.inMemoryStorage.put(tableName, primaryKey, reencrypted)
      }
    }
  }

  private tableHasSensitiveFields(def: TableDefinition): boolean {
    return Object.keys(def.columns).some(field => SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(field)))
  }

  // Enhanced authentication with rate limiting
  private checkAuthWithRateLimit(operation: string, table: string, data?: any): boolean {
    const clientId = this.getClientIdentifier()
    const now = Date.now()
    const windowMs = 15 * 60 * 1000 // 15 minutes
    const maxAttempts = 10

    // Clean up old attempts
    this.cleanupAuthAttempts()

    // Check rate limiting
    const attempts = this.authAttempts.get(clientId)
    if (attempts && attempts.count >= maxAttempts) {
      throw new Error('Too many authentication attempts. Please try again later.')
    }

    // Perform actual authentication check
    const authResult = this.checkAuth(operation, table, data)

    // Track failed attempts
    if (!authResult) {
      const currentAttempts = attempts || { count: 0, lastAttempt: now }
      currentAttempts.count++
      currentAttempts.lastAttempt = now
      this.authAttempts.set(clientId, currentAttempts)
    } else {
      // Reset attempts on successful auth
      this.authAttempts.delete(clientId)
    }

    return authResult
  }


  private getClientIdentifier(): string {
    // Simple client identifier - in production, use more sophisticated methods
    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin
    }
    return 'unknown-client'
  }

  private async encryptSensitiveFields(record: Record<string, unknown>, def: TableDefinition): Promise<Record<string, unknown>> {
    if (!this.encryptionKey) return record

    return this.encryptSensitiveFieldsWithKey(record, this.encryptionKey)
  }

  private async decryptSensitiveFields(record: Record<string, unknown>, def: TableDefinition): Promise<Record<string, unknown>> {
    if (!this.encryptionKey) return record

    return this.decryptSensitiveFieldsWithKey(record, this.encryptionKey)
  }

  private async encryptSensitiveFieldsWithKey(
    record: Record<string, unknown>,
    key: CryptoKey
  ): Promise<Record<string, unknown>> {
    if (!key) return record

    const result = { ...record }

    for (const [field, value] of Object.entries(record)) {
      if (typeof value === 'string' && SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(field))) {
        result[field] = await this.encryptDataWithKey(value, key)
      }
    }

    return result
  }

  private async decryptSensitiveFieldsWithKey(
    record: Record<string, unknown>,
    key: CryptoKey
  ): Promise<Record<string, unknown>> {
    if (!key) return record

    const result = { ...record }

    for (const [field, value] of Object.entries(record)) {
      if (typeof value === 'string' && SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(field))) {
        result[field] = await this.decryptDataWithKey(value, key)
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

  // Build HNSW index for modern approximate nearest neighbor search
  async buildHNSWIndex(table: string, maxLayers: number = 16, efConstruction: number = 200): Promise<void> {
    this.ensureDb()
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)

    const tx = this.db!.transaction([vectorStoreName(table), hnswStoreName(table)], "readwrite")
    const vStore = tx.objectStore(vectorStoreName(table))
    const hnswStore = tx.objectStore(hnswStoreName(table))

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

    // Simple HNSW implementation
    const dims = def.vector.dims
    const layers: Map<number, { id: number; vector: Float32Array; neighbors: Map<number, number> }>[] = []

    // Initialize layers
    for (let layer = 0; layer < maxLayers; layer++) {
      layers.push(new Map())
    }

    // Insert vectors into HNSW graph
    for (const { id, vector } of allVectors) {
      const entryLayer = Math.floor(-Math.log(Math.random()) * (maxLayers / Math.log(allVectors.length)))

      for (let layer = 0; layer <= entryLayer; layer++) {
        const layerGraph = layers[layer]

        if (layerGraph.size === 0) {
          // First node in layer
          layerGraph.set(id, { id, vector, neighbors: new Map() })
        } else {
          // Find nearest neighbors in current layer
          const nearest = this.findHNSWNeighbors(layerGraph, vector, efConstruction)

          // Add current node to layer
          const newNode = { id, vector, neighbors: new Map() }
          layerGraph.set(id, newNode)

          // Connect to nearest neighbors
          for (const neighborId of nearest) {
            const neighbor = layerGraph.get(neighborId)
            if (neighbor) {
              const distance = this.euclideanDistance(vector, neighbor.vector)
              newNode.neighbors.set(neighborId, distance)
              neighbor.neighbors.set(id, distance)
            }
          }
        }
      }
    }

    // Store HNSW layers
    for (let layer = 0; layer < layers.length; layer++) {
      const layerData = layers[layer]
      if (layerData.size > 0) {
        const serializedLayer = {
          layer,
          nodes: Array.from(layerData.entries()).map(([id, node]) => ({
            id,
            vector: Array.from(node.vector),
            neighbors: Array.from(node.neighbors.entries())
          }))
        }
        await requestToPromise(hnswStore.put(serializedLayer))
      }
    }

    await awaitTransaction(tx)
  }

  // Find nearest neighbors using HNSW graph
  private findHNSWNeighbors(
    layerGraph: Map<number, { id: number; vector: Float32Array; neighbors: Map<number, number> }>,
    query: Float32Array,
    ef: number
  ): number[] {
    if (layerGraph.size === 0) return []

    // Start from a random entry point
    const entryPoints = Array.from(layerGraph.keys())
    const startId = entryPoints[Math.floor(Math.random() * entryPoints.length)]

    const visited = new Set<number>()
    const candidates = new Set<number>([startId])
    const results: { id: number; distance: number }[] = []

    while (candidates.size > 0 && results.length < ef) {
      const currentId = Array.from(candidates).reduce((best, id) => {
        if (!visited.has(id)) {
          const node = layerGraph.get(id)
          if (node) {
            const distance = this.euclideanDistance(query, node.vector)
            if (!best || distance < best.distance) {
              return { id, distance }
            }
          }
        }
        return best
      }, null as { id: number; distance: number } | null)

      if (!currentId) break

      visited.add(currentId.id)
      results.push(currentId)

      // Add neighbors to candidates
      const currentNode = layerGraph.get(currentId.id)
      if (currentNode) {
        for (const neighborId of currentNode.neighbors.keys()) {
          if (!visited.has(neighborId)) {
            candidates.add(neighborId)
          }
        }
      }
    }

    // Sort by distance and return top results
    return results
      .sort((a, b) => a.distance - b.distance)
      .slice(0, ef)
      .map(r => r.id)
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
    this.vectorCache.set(key, { vector, lastAccessed: Date.now() });
    // Limit cache size using LRU eviction
    this.cleanupVectorCache();
  }

  // Get cached vector or compute and cache
  private async getCachedVector(table: string, text: string): Promise<Float32Array> {
    const cacheKey = `${table}:${text}`;
    const cached = this.vectorCache.get(cacheKey);
    if (cached) {
      // Update access time for LRU
      cached.lastAccessed = Date.now();
      return cached.vector;
    }

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
    opts?: { metric?: "cosine" | "dot" | "euclidean"; limit?: number; where?: WhereCondition; useIVF?: boolean; useHNSW?: boolean }
  ): Promise<(T & { id: number; score: number })[]> {
    this.ensureDb()
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)
    if (inputVector.length !== def.vector.dims) throw new Error(`Vector dimension mismatch. Expected ${def.vector.dims}`)

    const limit = opts?.limit ?? 50
    const metric = opts?.metric ?? "cosine"
    const useIVF = opts?.useIVF ?? false
    const useHNSW = opts?.useHNSW ?? true // Default to HNSW for better performance

    const tx = this.db!.transaction([table, vectorStoreName(table), ivfStoreName(table), hnswStoreName(table)], "readonly")
    const vStore = tx.objectStore(vectorStoreName(table))
    const tStore = tx.objectStore(table)
    const ivfStore = tx.objectStore(ivfStoreName(table))
    const hnswStore = tx.objectStore(hnswStoreName(table))

    const inputNorm = metric === "cosine" ? norm(inputVector) : 1
    const results: { id: number; score: number }[] = []

    // Try HNSW search first for best performance
    if (useHNSW) {
      try {
        // Load HNSW layers
        const hnswLayers: Map<number, { id: number; vector: Float32Array; neighbors: Map<number, number> }>[] = []
        await new Promise<void>((resolve, reject) => {
          const req = hnswStore.openCursor()
          req.onsuccess = () => {
            const cursor = req.result
            if (!cursor) {
              resolve()
              return
            }
            const { layer, nodes } = cursor.value
            const layerGraph = new Map<number, { id: number; vector: Float32Array; neighbors: Map<number, number> }>()

            for (const node of nodes) {
              layerGraph.set(node.id, {
                id: node.id,
                vector: new Float32Array(node.vector),
                neighbors: new Map(node.neighbors)
              })
            }
            hnswLayers[layer] = layerGraph
            cursor.continue()
          }
          req.onerror = () => reject(req.error)
        })

        // Search from top layer down
        if (hnswLayers.length > 0) {
          let entryPoints: number[] = []

          // Start from top layer
          for (let layer = hnswLayers.length - 1; layer >= 0; layer--) {
            const layerGraph = hnswLayers[layer]
            if (layerGraph && layerGraph.size > 0) {
              if (entryPoints.length === 0) {
                // Start from random point in top layer
                const topLayerIds = Array.from(layerGraph.keys())
                entryPoints = [topLayerIds[Math.floor(Math.random() * topLayerIds.length)]]
              } else {
                // Find nearest neighbors in current layer
                const nearest = this.findHNSWNeighbors(layerGraph, inputVector, Math.min(10, limit * 2))
                entryPoints = nearest.slice(0, Math.min(5, limit))
              }
            }
          }

          // Final search in bottom layer
          const bottomLayer = hnswLayers[0]
          if (bottomLayer && entryPoints.length > 0) {
            const finalNeighbors = this.findHNSWNeighbors(bottomLayer, inputVector, limit * 3)

            // Calculate scores for final neighbors
            for (const id of finalNeighbors) {
              const vecEntry = await requestToPromise(vStore.get(id))
              if (vecEntry) {
                const v = new Float32Array(vecEntry.vector)
                let score = 0
                if (metric === "cosine") score = dot(inputVector, v) / (inputNorm * norm(v) || 1)
                else if (metric === "dot") score = dot(inputVector, v)
                else if (metric === "euclidean") score = -euclideanDistance(inputVector, v)

                results.push({ id, score })
              }
            }
          }
        }
      } catch (error) {
        console.warn("HNSW search failed, falling back to other methods:", error)
      }
    }

    // Fall back to IVF if HNSW is disabled or failed
    if (results.length === 0 && useIVF) {
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

    // Fallback to full scan if both HNSW and IVF are disabled or failed
    if (results.length === 0 && !useHNSW && !useIVF) {
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

    // Fetch records in batches, apply optional where, sort and limit
    const out: (T & { id: number; score: number })[] = []

    // Process results in batches for better performance
    const batchSize = 50
    for (let i = 0; i < results.length; i += batchSize) {
      const batchResults = results.slice(i, i + batchSize)

      // Use a single transaction for each batch
      const batchTx = this.db!.transaction([table], "readonly")
      const batchStore = batchTx.objectStore(table)

      // Process all records in the current batch
      for (const { id, score } of batchResults) {
        const rec: any = await requestToPromise(batchStore.get(id))
        if (!rec) continue
        // Optional where filters
        if (opts?.where && !this.matchesWhere(rec, opts.where)) continue
        out.push({ ...(rec as T), id, score })
      }

      // Wait for batch transaction to complete before starting next
      await awaitTransaction(batchTx)
    }

    out.sort((a, b) => b.score - a.score)
    return out.slice(0, limit)
  }

  // Auto-build the best available vector index based on dataset size
  async buildOptimalVectorIndex(table: string): Promise<void> {
    this.ensureDb()
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)

    // Check dataset size
    const stats = await this.getStats(table)
    const count = typeof stats === 'object' && 'count' in stats ? (stats as any).count : 0

    if (count === 0) {
      console.warn(`No data in table ${table}, skipping index building`)
      return
    }

    console.log(`Building optimal vector index for table ${table} with ${count} records`)

    // Choose index strategy based on dataset size
    if (count <= 1000) {
      // Small dataset - use IVF for simplicity
      console.log('Using IVF index for small dataset')
      await this.buildIVFIndex(table, Math.min(16, Math.ceil(count / 10)))
    } else if (count <= 10000) {
      // Medium dataset - use HNSW for good performance
      console.log('Using HNSW index for medium dataset')
      await this.buildHNSWIndex(table, Math.min(16, Math.ceil(Math.log2(count))))
    } else {
      // Large dataset - use HNSW with optimized parameters
      console.log('Using optimized HNSW index for large dataset')
      await this.buildHNSWIndex(table, Math.min(32, Math.ceil(Math.log2(count))), 400)
    }

    console.log(`Vector index built successfully for table ${table}`)
  }

  // Get vector search performance statistics
  async getVectorSearchStats(table: string): Promise<{
    totalVectors: number
    hasIVFIndex: boolean
    hasHNSWIndex: boolean
    indexSize: number
    recommendation: string
  }> {
    this.ensureDb()
    const def = this.ensureTable(table)
    if (!def.vector) throw new Error(`Table ${table} has no vector configuration`)

    const tx = this.db!.transaction([vectorStoreName(table), ivfStoreName(table), hnswStoreName(table)], "readonly")
    const vStore = tx.objectStore(vectorStoreName(table))
    const ivfStore = tx.objectStore(ivfStoreName(table))
    const hnswStore = tx.objectStore(hnswStoreName(table))

    // Count vectors
    let totalVectors = 0
    await new Promise<void>((resolve, reject) => {
      const req = vStore.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve()
          return
        }
        totalVectors++
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })

    // Check for IVF index
    let hasIVFIndex = false
    try {
      const ivfCount = await requestToPromise(ivfStore.count())
      hasIVFIndex = ivfCount > 0
    } catch {
      hasIVFIndex = false
    }

    // Check for HNSW index
    let hasHNSWIndex = false
    try {
      const hnswCount = await requestToPromise(hnswStore.count())
      hasHNSWIndex = hnswCount > 0
    } catch {
      hasHNSWIndex = false
    }

    // Calculate index size (approximate)
    const indexSize = (hasIVFIndex ? 100 : 0) + (hasHNSWIndex ? 200 : 0) // KB approximation

    // Generate recommendation
    let recommendation = 'No index needed for empty dataset'
    if (totalVectors > 0) {
      if (totalVectors <= 1000 && !hasIVFIndex) {
        recommendation = 'Build IVF index for optimal performance'
      } else if (totalVectors > 1000 && !hasHNSWIndex) {
        recommendation = 'Build HNSW index for optimal performance'
      } else if (hasIVFIndex && totalVectors > 5000) {
        recommendation = 'Consider upgrading to HNSW index for better performance'
      } else {
        recommendation = 'Current index configuration is optimal'
      }
    }

    return {
      totalVectors,
      hasIVFIndex,
      hasHNSWIndex,
      indexSize,
      recommendation
    }
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
      if (this.options.sync?.enabled === false) {
        throw new ColumnistDBError('Sync is disabled. Enable sync in options to use sync features.', 'SYNC_DISABLED')
      }
      this.syncManager = new SyncManager(this)
      // Initialize sync manager asynchronously
      this.syncManager.initialize().catch(error => {
        console.error('Failed to initialize sync manager:', error)
      })
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
    if (!this.db && !this.useInMemory) throw new Error("Database not loaded. Call load() first.")
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

  // Memory Management Methods

  private startMemoryManagement(): void {
    if (this.cleanupInterval) return;

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, this.memoryConfig.cacheCleanupInterval);

    // Cleanup on process exit (Node.js)
    if (typeof process !== 'undefined' && process.on) {
      process.on('exit', () => this.stopMemoryManagement());
      process.on('SIGINT', () => this.stopMemoryManagement());
      process.on('SIGTERM', () => this.stopMemoryManagement());
    }

    // Cleanup on page unload (browser)
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeunload', () => this.stopMemoryManagement());
    }
  }

  private stopMemoryManagement(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private performMemoryCleanup(): void {
    const now = Date.now();

    // Only perform full cleanup every 30 seconds to avoid performance impact
    if (now - this.lastMemoryCheck < 30000) {
      return;
    }

    this.lastMemoryCheck = now;

    // Clean up all caches
    this.cleanupVectorCache();
    this.cleanupVectorEmbedders();
    this.cleanupSubscribers();
    this.cleanupAuthAttempts();

    // Check memory usage and trigger aggressive cleanup if needed
    if (this.isMemoryPressure()) {
      this.aggressiveMemoryCleanup();
    }
  }

  private cleanupVectorCache(): void {
    if (this.vectorCache.size <= this.memoryConfig.maxVectorCacheSize) {
      return;
    }

    // LRU eviction: remove least recently used entries
    const entries = Array.from(this.vectorCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const entriesToRemove = entries.slice(0, Math.floor(this.vectorCache.size * 0.2)); // Remove 20% oldest
    for (const [key] of entriesToRemove) {
      this.vectorCache.delete(key);
    }
  }

  private cleanupVectorEmbedders(): void {
    if (this.vectorEmbedders.size <= this.memoryConfig.maxVectorEmbedders) {
      return;
    }

    // Remove embedders for tables that haven't been used recently
    // This is a simple implementation - in production you'd track usage
    const entries = Array.from(this.vectorEmbedders.entries());
    const entriesToRemove = entries.slice(this.memoryConfig.maxVectorEmbedders);

    for (const [table] of entriesToRemove) {
      this.vectorEmbedders.delete(table);
    }
  }

  private cleanupSubscribers(): void {
    for (const [table, subscribers] of this.subscribers.entries()) {
      if (subscribers.size > this.memoryConfig.maxSubscribersPerTable) {
        // Convert to array and remove oldest subscribers
        const subscriberArray = Array.from(subscribers);
        const subscribersToRemove = subscriberArray.slice(this.memoryConfig.maxSubscribersPerTable);

        for (const subscriber of subscribersToRemove) {
          subscribers.delete(subscriber);
        }
      }
    }
  }

  private cleanupAuthAttempts(): void {
    if (this.authAttempts.size <= this.memoryConfig.maxAuthAttempts) {
      return;
    }

    // Remove oldest auth attempts
    const entries = Array.from(this.authAttempts.entries());
    entries.sort((a, b) => a[1].lastAttempt - b[1].lastAttempt);

    const entriesToRemove = entries.slice(0, Math.floor(this.authAttempts.size * 0.2));
    for (const [clientId] of entriesToRemove) {
      this.authAttempts.delete(clientId);
    }
  }

  private isMemoryPressure(): boolean {
    // Simple memory pressure detection
    // In production, you'd use performance.memory in browsers or process.memoryUsage() in Node.js

    // Browser memory check (commented out for TypeScript compatibility)
    // if (typeof performance !== 'undefined' && (performance as any).memory) {
    //   const memory = (performance as any).memory;
    //   return memory.usedJSHeapSize > this.memoryConfig.maxMemoryUsage;
    // }

    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      return memory.heapUsed > this.memoryConfig.maxMemoryUsage;
    }

    // Fallback: check if any cache is significantly oversized
    return (
      this.vectorCache.size > this.memoryConfig.maxVectorCacheSize * 2 ||
      this.vectorEmbedders.size > this.memoryConfig.maxVectorEmbedders * 2 ||
      this.authAttempts.size > this.memoryConfig.maxAuthAttempts * 2
    );
  }

  private aggressiveMemoryCleanup(): void {
    console.warn('Memory pressure detected, performing aggressive cleanup');

    // Clear all caches
    this.vectorCache.clear();
    this.vectorEmbedders.clear();
    this.authAttempts.clear();

    // Clear subscribers (but keep the structure)
    for (const subscribers of this.subscribers.values()) {
      subscribers.clear();
    }
  }

  // Public method to manually trigger memory cleanup
  async forceMemoryCleanup(): Promise<void> {
    this.performMemoryCleanup();
  }

  // Public method to get memory usage statistics
  getMemoryStats(): {
    vectorCacheSize: number;
    vectorEmbeddersSize: number;
    subscribersSize: number;
    authAttemptsSize: number;
    totalEstimatedMemory: number;
    memoryPressure: boolean;
  } {
    const stats = {
      vectorCacheSize: this.vectorCache.size,
      vectorEmbeddersSize: this.vectorEmbedders.size,
      subscribersSize: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0),
      authAttemptsSize: this.authAttempts.size,
      totalEstimatedMemory: 0,
      memoryPressure: this.isMemoryPressure()
    };

    // Rough memory estimation (in bytes)
    stats.totalEstimatedMemory =
      stats.vectorCacheSize * 1024 + // ~1KB per vector
      stats.vectorEmbeddersSize * 1024 + // ~1KB per embedder
      stats.subscribersSize * 128 + // ~128 bytes per subscriber
      stats.authAttemptsSize * 64; // ~64 bytes per auth attempt

    return stats;
  }

  // Method to configure memory management
  configureMemoryManagement(config: Partial<typeof this.memoryConfig>): void {
    this.memoryConfig = { ...this.memoryConfig, ...config };

    // Restart memory management if configuration changed
    if (this.memoryConfig.enableMemoryMonitoring) {
      this.startMemoryManagement();
    } else {
      this.stopMemoryManagement();
    }
  }

  // Error Recovery Methods

  // Start error recovery monitoring
  private startErrorRecovery(): void {
    if (this.healthCheckInterval) return;

    if (this.errorRecoveryConfig.enableHealthChecks) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, this.errorRecoveryConfig.healthCheckInterval);
    }
  }

  // Stop error recovery monitoring
  private stopErrorRecovery(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Perform health check on database
  private async performHealthCheck(): Promise<void> {
    try {
      // Test basic database operations
      await this.testDatabaseHealth();

      // If we're in degraded mode and health check passes, attempt recovery
      if (this.errorState.isDegraded) {
        console.log('Health check passed, attempting recovery from degraded state');
        await this.attemptRecovery();
      }
    } catch (error) {
      console.error('Health check failed:', error);
      this.trackError(error as Error, 'health_check');
    }
  }

  // Test database health with basic operations
  private async testDatabaseHealth(): Promise<void> {
    if (this.useInMemory) {
      // Test in-memory storage
      if (!this.inMemoryStorage) {
        throw new Error('In-memory storage not available');
      }

      // Test basic operations on a sample table
      const testTable = Object.keys(this.schema)[0];
      if (testTable) {
        const count = this.inMemoryStorage.count(testTable);
        // If we can count without error, storage is healthy
        if (count < 0) {
          throw new Error('Invalid count returned from in-memory storage');
        }
      }
    } else {
      // Test IndexedDB connection
      if (!this.db) {
        throw new Error('Database connection not available');
      }

      // Test transaction creation
      const tx = this.db.transaction([META_SCHEMA_STORE], 'readonly');
      await requestToPromise(tx.objectStore(META_SCHEMA_STORE).count());
    }
  }

  // Track and handle errors with retry logic
  private async handleOperationWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    critical: boolean = false
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.errorRecoveryConfig.maxRetryAttempts; attempt++) {
      try {
        // Check if we should attempt operation in current state
        if (this.errorState.isDegraded && critical) {
          throw new Error(`Operation ${operationName} cannot proceed in degraded state`);
        }

        const result = await operation();

        // Reset error state on successful operation
        if (this.errorState.errorCount > 0) {
          this.resetErrorState();
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        this.trackError(error as Error, operationName);

        // Check if we should retry
        if (attempt < this.errorRecoveryConfig.maxRetryAttempts) {
          const delay = this.errorRecoveryConfig.exponentialBackoff
            ? this.errorRecoveryConfig.retryDelay * Math.pow(2, attempt - 1)
            : this.errorRecoveryConfig.retryDelay;

          console.warn(`Retrying ${operationName} after error (attempt ${attempt}/${this.errorRecoveryConfig.maxRetryAttempts}):`, error);
          await this.delay(delay);
        }
      }
    }

    // All retries failed
    if (critical) {
      this.enterDegradedMode();
    }

    throw new ColumnistDBError(
      `Operation ${operationName} failed after ${this.errorRecoveryConfig.maxRetryAttempts} attempts: ${lastError?.message}`,
      'OPERATION_FAILED'
    );
  }

  // Track error and update error state
  private trackError(error: Error, operation: string): void {
    this.errorState.lastError = error;
    this.errorState.errorCount++;

    // Check if we should enter degraded mode
    if (this.errorState.errorCount >= 5 && !this.errorState.isDegraded) {
      this.enterDegradedMode();
    }

    // Log error for monitoring
    console.error(`[ColumnistDB] Error in ${operation}:`, error);
  }

  // Enter degraded mode
  private enterDegradedMode(): void {
    this.errorState.isDegraded = true;
    this.errorState.recoveryInProgress = false;

    console.warn('[ColumnistDB] Entering degraded mode due to multiple errors');

    // Attempt recovery if auto-recovery is enabled
    if (this.errorRecoveryConfig.enableAutoRecovery) {
      this.attemptRecovery();
    }
  }

  // Attempt recovery from degraded state
  private async attemptRecovery(): Promise<void> {
    if (this.errorState.recoveryInProgress) {
      return;
    }

    this.errorState.recoveryInProgress = true;

    try {
      console.log('[ColumnistDB] Attempting recovery...');

      // Strategy 1: Try to reinitialize database
      if (!this.useInMemory) {
        try {
          await this.load();
          console.log('[ColumnistDB] Database reinitialized successfully');
        } catch (error) {
          console.warn('[ColumnistDB] Database reinitialization failed:', error);
        }
      }

      // Strategy 2: Clear caches and reset state
      this.performMemoryCleanup();

      // Strategy 3: Test basic operations
      await this.testDatabaseHealth();

      // Recovery successful
      this.resetErrorState();
      console.log('[ColumnistDB] Recovery completed successfully');

    } catch (error) {
      console.error('[ColumnistDB] Recovery failed:', error);

      // Enter fallback mode if enabled
      if (this.errorRecoveryConfig.enableFallbackMode && !this.errorState.fallbackMode) {
        this.enterFallbackMode();
      }
    } finally {
      this.errorState.recoveryInProgress = false;
    }
  }

  // Enter fallback mode (minimal functionality)
  private enterFallbackMode(): void {
    this.errorState.fallbackMode = true;
    console.warn('[ColumnistDB] Entering fallback mode - limited functionality available');
  }

  // Reset error state
  private resetErrorState(): void {
    this.errorState = {
      isDegraded: false,
      lastError: null,
      errorCount: 0,
      recoveryInProgress: false,
      fallbackMode: false
    };
    console.log('[ColumnistDB] Error state reset');
  }

  // Utility delay function
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public method to get error recovery status
  getErrorRecoveryStatus(): {
    isDegraded: boolean
    errorCount: number
    lastError: string | null
    recoveryInProgress: boolean
    fallbackMode: boolean
  } {
    return {
      isDegraded: this.errorState.isDegraded,
      errorCount: this.errorState.errorCount,
      lastError: this.errorState.lastError?.message || null,
      recoveryInProgress: this.errorState.recoveryInProgress,
      fallbackMode: this.errorState.fallbackMode
    };
  }

  // Public method to manually trigger recovery
  async forceRecovery(): Promise<void> {
    if (this.errorState.isDegraded) {
      await this.attemptRecovery();
    }
  }

  // Public method to configure error recovery
  // Error recovery integration methods
  async withErrorRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    fallbackOperation?: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.errorRecoveryManager.withRetry(
        operation,
        operationName,
        {
          maxRetries: this.errorRecoveryConfig.maxRetryAttempts,
          baseDelay: this.errorRecoveryConfig.retryDelay,
          backoffMultiplier: this.errorRecoveryConfig.exponentialBackoff ? 2 : 1
        }
      )
    } catch (error) {
      const errorType = this.errorRecoveryManager.classifyError(error as Error)

      // Update error state
      this.errorState.lastError = error as Error
      this.errorState.errorCount++
      this.errorState.isDegraded = true

      // Try fallback operation if available and appropriate
      if (fallbackOperation && this.shouldUseFallback(errorType)) {
        try {
          console.warn(`Using fallback for ${operationName} due to ${errorType} error`)
          return await fallbackOperation()
        } catch (fallbackError) {
          console.error(`Fallback operation also failed: ${fallbackError}`)
        }
      }

      // Enable fallback mode if storage error
      if (errorType === ErrorType.STORAGE && this.errorRecoveryConfig.enableFallbackMode) {
        this.errorState.fallbackMode = true
        console.warn('Entering fallback mode due to storage errors')
      }

      throw error
    }
  }

  private shouldUseFallback(errorType: ErrorType): boolean {
    return errorType === ErrorType.STORAGE ||
           errorType === ErrorType.NETWORK ||
           errorType === ErrorType.TRANSIENT
  }

  // Graceful degradation methods
  private async gracefulDegradation<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    if (this.errorState.fallbackMode) {
      return await fallbackOperation()
    }

    try {
      return await this.withErrorRecovery(primaryOperation, operationName, fallbackOperation)
    } catch (error) {
      // If primary operation fails and we're not already in fallback mode, try fallback
      if (!this.errorState.fallbackMode) {
        try {
          console.warn(`Primary operation failed, using fallback for ${operationName}`)
          return await fallbackOperation()
        } catch (fallbackError) {
          console.error(`Both primary and fallback operations failed for ${operationName}`)
          throw error // Throw the original error
        }
      }
      throw error
    }
  }

  // Health check and recovery methods
  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = []

    // Check database connection
    if (!this.db && !this.useInMemory) {
      issues.push('Database connection not established')
    }

    // Check error state
    if (this.errorState.isDegraded) {
      issues.push('Database is in degraded state')
    }

    if (this.errorState.fallbackMode) {
      issues.push('Database is in fallback mode')
    }

    // Check memory usage
    if (this.memoryConfig.enableMemoryMonitoring) {
      const memoryUsage = this.getMemoryUsage()
      if (memoryUsage > this.memoryConfig.maxMemoryUsage * 0.9) {
        issues.push('Memory usage approaching limit')
      }
    }

    // Check circuit breaker states
    const recoveryStats = this.errorRecoveryManager.getStats()
    for (const [operation, state] of Object.entries(recoveryStats.circuitStates)) {
      if (state === 'OPEN') {
        issues.push(`Circuit breaker OPEN for operation: ${operation}`)
      }
    }

    return {
      healthy: issues.length === 0,
      issues
    }
  }

  async recover(): Promise<{ success: boolean; recoveredOperations: string[] }> {
    const recoveredOperations: string[] = []

    // Reset error state
    this.errorState.isDegraded = false
    this.errorState.fallbackMode = false
    this.errorState.recoveryInProgress = true

    try {
      // Try to reinitialize database if needed
      if (!this.db && !this.useInMemory) {
        await this.initializeDatabase()
        recoveredOperations.push('database_connection')
      }

      // Clear circuit breakers
      const recoveryStats = this.errorRecoveryManager.getStats()
      for (const operation of Object.keys(recoveryStats.circuitStates)) {
        // Reset circuit breaker by simulating success
        this.errorRecoveryManager['recordSuccess'](operation)
        recoveredOperations.push(`circuit_breaker_${operation}`)
      }

      // Clear memory cache if needed
      if (this.getMemoryUsage() > this.memoryConfig.maxMemoryUsage * 0.8) {
        this.clearMemoryCache()
        recoveredOperations.push('memory_cache')
      }

      this.errorState.recoveryInProgress = false
      return { success: true, recoveredOperations }
    } catch (error) {
      this.errorState.recoveryInProgress = false
      console.error('Recovery failed:', error)
      return { success: false, recoveredOperations }
    }
  }

  // Public API for error recovery
  getErrorRecoveryStats(): {
    errorState: { isDegraded: boolean; lastError: Error | null; errorCount: number; recoveryInProgress: boolean; fallbackMode: boolean }
    recoveryStats: ReturnType<ErrorRecoveryManager['getStats']>
    health: { healthy: boolean; issues: string[] }
  } {
    return {
      errorState: { ...this.errorState },
      recoveryStats: this.errorRecoveryManager.getStats(),
      health: { healthy: false, issues: [] } // Will be populated by health check
    }
  }

  configureErrorRecovery(config: Partial<{ enableHealthChecks: boolean; healthCheckInterval: number; maxErrorThreshold: number; recoveryTimeout: number }>): void {
    this.errorRecoveryConfig = { ...this.errorRecoveryConfig, ...config };

    // Restart error recovery monitoring if configuration changed
    if (this.errorRecoveryConfig.enableHealthChecks) {
      this.startErrorRecovery();
    } else {
      this.stopErrorRecovery();
    }
  }

  // Production monitoring and metrics methods
  private startMonitoring(): void {
    if (this.monitoringConfig.enableMetrics && !this.metricsInterval) {
      this.metricsInterval = setInterval(() => {
        this.collectMetrics()
      }, this.monitoringConfig.metricsCollectionInterval)
    }
  }

  private stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
      this.metricsInterval = null
    }
  }

  private collectMetrics(): void {
    const now = Date.now()
    const timeSinceLastUpdate = now - this.lastMetricsUpdate

    // Collect memory usage
    if (this.monitoringConfig.enableResourceMonitoring) {
      const memory = this.getMemoryUsage()
      this.metrics.memoryUsage.push(memory)

      // Keep only recent history
      if (this.metrics.memoryUsage.length > this.monitoringConfig.maxMetricsHistory) {
        this.metrics.memoryUsage.shift()
      }
    }

    // Calculate performance statistics
    if (this.monitoringConfig.enablePerformanceTracking) {
      this.calculatePerformanceStats(timeSinceLastUpdate)
    }

    this.lastMetricsUpdate = now
  }

  private calculatePerformanceStats(timeWindow: number): void {
    let totalOperations = 0
    let totalTime = 0
    let totalErrors = 0
    let cacheHits = 0
    let cacheAccesses = 0

    // Calculate operation statistics
    for (const [operation, count] of this.metrics.operationCounts) {
      totalOperations += count

      const timings = this.metrics.operationTimings.get(operation) || []
      totalTime += timings.reduce((sum, time) => sum + time, 0)

      const errors = this.metrics.errorCounts.get(operation) || 0
      totalErrors += errors

      // Reset counts for next interval
      this.metrics.operationCounts.set(operation, 0)
      this.metrics.errorCounts.set(operation, 0)
      this.metrics.operationTimings.set(operation, [])
    }

    // Calculate cache statistics
    if (this.metrics.customMetrics.has('cache_hits')) {
      cacheHits = this.metrics.customMetrics.get('cache_hits') || 0
      cacheAccesses = this.metrics.customMetrics.get('cache_accesses') || 0
      this.metrics.customMetrics.set('cache_hits', 0)
      this.metrics.customMetrics.set('cache_accesses', 0)
    }

    // Update performance stats
    this.metrics.performanceStats = {
      averageResponseTime: totalOperations > 0 ? totalTime / totalOperations : 0,
      throughput: timeWindow > 0 ? (totalOperations / timeWindow) * 1000 : 0, // ops/second
      errorRate: totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0,
      cacheHitRate: cacheAccesses > 0 ? (cacheHits / cacheAccesses) * 100 : 0
    }
  }

  private trackOperation(operation: string, duration: number, success: boolean = true): void {
    if (!this.monitoringConfig.enableMetrics) return

    // Track operation count
    const currentCount = this.metrics.operationCounts.get(operation) || 0
    this.metrics.operationCounts.set(operation, currentCount + 1)

    // Track operation timing
    const timings = this.metrics.operationTimings.get(operation) || []
    timings.push(duration)
    this.metrics.operationTimings.set(operation, timings)

    // Track errors
    if (!success) {
      const errorCount = this.metrics.errorCounts.get(operation) || 0
      this.metrics.errorCounts.set(operation, errorCount + 1)
    }
  }

  private trackCacheAccess(hit: boolean): void {
    if (!this.monitoringConfig.enableMetrics) return

    const hits = this.metrics.customMetrics.get('cache_hits') || 0
    const accesses = this.metrics.customMetrics.get('cache_accesses') || 0

    if (hit) {
      this.metrics.customMetrics.set('cache_hits', hits + 1)
    }
    this.metrics.customMetrics.set('cache_accesses', accesses + 1)
  }

  // Public monitoring API
  getMetrics(): {
    operationCounts: Record<string, number>
    operationTimings: Record<string, number[]>
    errorCounts: Record<string, number>
    memoryUsage: number[]
    performanceStats: { averageResponseTime: number; throughput: number; errorRate: number }
    customMetrics: Record<string, any>
  } {
    return {
      operationCounts: Object.fromEntries(this.metrics.operationCounts),
      operationTimings: Object.fromEntries(this.metrics.operationTimings),
      errorCounts: Object.fromEntries(this.metrics.errorCounts),
      memoryUsage: [...this.metrics.memoryUsage],
      performanceStats: { ...this.metrics.performanceStats },
      customMetrics: Object.fromEntries(this.metrics.customMetrics)
    }
  }

  getPerformanceReport(): {
    summary: {
      uptime: number
      totalOperations: number
      totalErrors: number
      averageResponseTime: number
      throughput: number
      errorRate: number
      cacheHitRate: number
    }
    topOperations: Array<{ operation: string; count: number; avgTime: number; errorRate: number }>
    recommendations: string[]
  } {
    const uptime = Date.now() - this.lastMetricsUpdate
    let totalOperations = 0
    let totalErrors = 0

    const operationStats = Array.from(this.metrics.operationCounts.entries()).map(([operation, count]) => {
      const timings = this.metrics.operationTimings.get(operation) || []
      const errors = this.metrics.errorCounts.get(operation) || 0
      const avgTime = timings.length > 0 ? timings.reduce((sum, time) => sum + time, 0) / timings.length : 0
      const errorRate = count > 0 ? (errors / count) * 100 : 0

      totalOperations += count
      totalErrors += errors

      return { operation, count, avgTime, errorRate }
    })

    // Sort by operation count (descending)
    operationStats.sort((a, b) => b.count - a.count)

    const recommendations: string[] = []

    // Generate recommendations based on metrics
    if (this.metrics.performanceStats.errorRate > 5) {
      recommendations.push('High error rate detected. Consider implementing better error handling.')
    }

    if (this.metrics.performanceStats.averageResponseTime > 1000) {
      recommendations.push('Slow response times detected. Consider optimizing database operations.')
    }

    if (this.metrics.performanceStats.cacheHitRate < 50) {
      recommendations.push('Low cache hit rate. Consider increasing cache size or improving caching strategy.')
    }

    return {
      summary: {
        uptime,
        totalOperations,
        totalErrors,
        averageResponseTime: this.metrics.performanceStats.averageResponseTime,
        throughput: this.metrics.performanceStats.throughput,
        errorRate: this.metrics.performanceStats.errorRate,
        cacheHitRate: this.metrics.performanceStats.cacheHitRate
      },
      topOperations: operationStats.slice(0, 10),
      recommendations
    }
  }

  configureMonitoring(config: Partial<typeof this.monitoringConfig>): void {
    this.monitoringConfig = { ...this.monitoringConfig, ...config }

    // Restart monitoring if configuration changed
    if (this.monitoringConfig.enableMetrics) {
      this.startMonitoring()
    } else {
      this.stopMonitoring()
    }
  }

  // Method to add custom metrics
  trackCustomMetric(name: string, value: any): void {
    if (this.monitoringConfig.enableMetrics) {
      this.metrics.customMetrics.set(name, value)
    }
  }

  // Memory management methods
  getMemoryUsage(): number {
    // Simple memory usage estimation for Node.js environment
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    // Fallback for browser environments
    return 0;
  }

  clearMemoryCache(): void {
    // Clear any cached data to free memory
    this.vectorCache.clear();
    // Additional cache clearing logic can be added here
  }

  // Database initialization method
  async initializeDatabase(): Promise<void> {
    // Initialize database if needed
    // This method can be overridden by subclasses
    if (!this.db && !this.useInMemory) {
      // Call the static init method with default parameters
      await ColumnistDB.init('columnist-db');
    }
  }
}

export const Columnist = {
  init: ColumnistDB.init.bind(ColumnistDB),
  getDB: ColumnistDB.getDB.bind(ColumnistDB),
}

export default Columnist


