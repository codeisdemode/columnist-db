import { z } from "zod"

export type ColumnType = "string" | "number" | "boolean" | "date" | "json"

export interface TableDefinition {
  columns: Record<string, ColumnType | { type: 'vector'; dimension: number }>
  primaryKey?: string
  searchableFields?: string[]
  secondaryIndexes?: string[]
  validation?: z.ZodSchema
  vector?: {
    field: string
    dims: number
  }
}

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
    : T["columns"][K] extends { type: 'vector'; dimension: number }
    ? Float32Array
    : never
} & { id: number }

export interface SearchOptions {
  table?: string
  limit?: number
  timeRange?: [Date | string, Date | string]
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

export interface ColumnistDBOptions {
  databaseName: string
  autoInitialize?: boolean
  sync?: {
    enabled?: boolean
    autoRegisterDevices?: boolean
  }
  vectorSearch?: {
    autoConfigure?: boolean
    defaultDimension?: number
  }
  tables?: Record<string, TableDefinition>
  version?: number
  migrations?: Record<number, (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void>
  encryptionKey?: string
}

export interface BulkOperationResult {
  success: number
  errors: Array<{ error: Error; record: any }>
}