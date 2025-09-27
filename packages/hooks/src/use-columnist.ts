"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Columnist, type SchemaDefinition, type FindOptions, type SearchOptions, type InsertResult, type WhereCondition } from "columnist-db-core"

export interface UseColumnistOptions {
  name: string
  schema?: SchemaDefinition
  version?: number
}

export interface UseColumnistResult<Schema extends SchemaDefinition = SchemaDefinition> {
  db: any | null
  isLoading: boolean
  error: Error | null
  // Convenience methods that work with the current db instance
  insert: <T extends Record<string, unknown>>(record: T, table?: string) => Promise<InsertResult>
  update: <T extends Record<string, unknown>>(id: number, updates: Partial<T>, table?: string) => Promise<void>
  delete: (id: number, table?: string) => Promise<void>
  upsert: <T extends Record<string, unknown>>(record: T, table?: string) => Promise<InsertResult>
  find: <T = any>(options?: FindOptions) => Promise<(T & { id: number })[]>
  search: <T = any>(query: string, options?: SearchOptions) => Promise<(T & { id: number; score: number })[]>
  getAll: <T = unknown>(table: string, limit?: number) => Promise<(T & { id: number })[]>
  getStats: (table?: string) => Promise<any>
  subscribe: (table: string, fn: (event: any) => void) => () => void
  transaction: (work: (tx: any) => Promise<void>) => Promise<void>
}

/**
 * React hook for managing a Columnist database instance
 * 
 * @example
 * ```tsx
 * const { db, insert, find, isLoading, error } = useColumnist({
 *   name: "my-app",
 *   schema: {
 *     messages: {
 *       columns: { id: "number", text: "string", timestamp: "date" },
 *       searchableFields: ["text"]
 *     }
 *   }
 * })
 * 
 * // Use convenience methods
 * await insert({ text: "Hello", timestamp: new Date() })
 * const messages = await find({ table: "messages", orderBy: "timestamp" })
 * ```
 */
export function useColumnist<Schema extends SchemaDefinition = SchemaDefinition>(
  options: UseColumnistOptions
): UseColumnistResult<Schema> {
  const [db, setDb] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Initialize database
  useEffect(() => {
    let cancelled = false

    async function initDb() {
      try {
        setIsLoading(true)
        setError(null)
        
        const instance = await Columnist.init(options.name, {
          databaseName: options.name,
          schema: options.schema,
          version: options.version
        })

        if (!cancelled) {
          setDb(instance)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to initialize database"))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    initDb()

    return () => {
      cancelled = true
    }
  }, [options.name, options.schema, options.version])

  // Convenience method factories that use the current db instance
  const insert = useCallback(async <T extends Record<string, unknown>>(
    record: T, 
    table?: string
  ): Promise<InsertResult> => {
    if (!db) throw new Error("Database not initialized")
    return await db.insert(record, table)
  }, [db])

  const update = useCallback(async <T extends Record<string, unknown>>(
    id: number, 
    updates: Partial<T>, 
    table?: string
  ): Promise<void> => {
    if (!db) throw new Error("Database not initialized")
    return await db.update(id, updates, table)
  }, [db])

  const deleteRecord = useCallback(async (id: number, table?: string): Promise<void> => {
    if (!db) throw new Error("Database not initialized")
    return await db.delete(id, table)
  }, [db])

  const upsert = useCallback(async <T extends Record<string, unknown>>(
    record: T, 
    table?: string
  ): Promise<InsertResult> => {
    if (!db) throw new Error("Database not initialized")
    return await db.upsert(record, table)
  }, [db])

  const find = useCallback(async (options?: FindOptions): Promise<any[]> => {
    if (!db) throw new Error("Database not initialized")
    return await db.find(options)
  }, [db])

  const search = useCallback(async (
    query: string, 
    options?: SearchOptions
  ): Promise<any[]> => {
    if (!db) throw new Error("Database not initialized")
    return await db.search(query, options)
  }, [db])

  const getAll = useCallback(async (
    table: string, 
    limit?: number
  ): Promise<any[]> => {
    if (!db) throw new Error("Database not initialized")
    return await db.getAll(table, limit)
  }, [db])

  const getStats = useCallback(async (table?: string): Promise<any> => {
    if (!db) throw new Error("Database not initialized")
    return await db.getStats(table)
  }, [db])

  const subscribe = useCallback((table: string, fn: (event: any) => void): () => void => {
    if (!db) throw new Error("Database not initialized")
    return db.subscribe(table, fn)
  }, [db])

  const transaction = useCallback(async (work: (tx: any) => Promise<void>): Promise<void> => {
    if (!db) throw new Error("Database not initialized")
    return await db.transaction(work)
  }, [db])

  const result = useMemo(() => ({
    db,
    isLoading,
    error,
    insert,
    update,
    delete: deleteRecord,
    upsert,
    find,
    search,
    getAll,
    getStats,
    subscribe,
    transaction
  }), [
    db, 
    isLoading, 
    error, 
    insert, 
    update, 
    deleteRecord, 
    upsert, 
    find, 
    search, 
    getAll, 
    getStats, 
    subscribe, 
    transaction
  ])

  return result
}
