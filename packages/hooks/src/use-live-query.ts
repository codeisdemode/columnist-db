"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Columnist, type FindOptions, type SearchOptions } from "columnist-db-core"

export interface UseLiveQueryOptions extends FindOptions {
  // Override table to be required for clarity
  table: string
  // Dependencies that should trigger re-query
  deps?: unknown[]
  // Whether to enable automatic subscriptions (default: true)
  subscribe?: boolean
}

export interface UseLiveQueryResult<T = any> {
  data: (T & { id: number })[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * React hook for reactive database queries with automatic subscriptions
 * 
 * @example
 * ```tsx
 * // Basic usage
 * const { data: messages, isLoading } = useLiveQuery({
 *   table: "messages",
 *   where: { user_id: currentUserId },
 *   orderBy: { field: "timestamp", direction: "desc" },
 *   limit: 50
 * })
 * 
 * // With dependencies
 * const { data: filtered } = useLiveQuery({
 *   table: "messages", 
 *   where: { user_id: selectedUser },
 *   deps: [selectedUser]
 * })
 * ```
 */
export function useLiveQuery<T = any>(options: UseLiveQueryOptions): UseLiveQueryResult<T> {
  const [data, setData] = useState<(T & { id: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const { table, where, orderBy, limit, offset, deps = [], subscribe = true } = options

  // Create stable query options object
  const queryOptions = useMemo((): FindOptions => ({
    table,
    where,
    orderBy,
    limit,
    offset
  }), [table, where, orderBy, limit, offset])

  // Execute query
  const executeQuery = useCallback(async () => {
    try {
      setError(null)
      const db = Columnist.getDB()
      const results = await db.find<T>(queryOptions)
      setData(results)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Query failed"))
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [queryOptions])

  // Refetch function for manual updates
  const refetch = useCallback(async () => {
    setIsLoading(true)
    await executeQuery()
  }, [executeQuery])

  // Initial query and dependency updates
  useEffect(() => {
    setIsLoading(true)
    executeQuery()
  }, [executeQuery, ...deps])

  // Subscription for reactive updates
  useEffect(() => {
    if (!subscribe) return

    try {
      const db = Columnist.getDB()
      const unsubscribe = db.subscribe(table, (event) => {
        // Re-run query when table changes
        // This is a simple approach - could be optimized to only update
        // when the change affects the current query results
        executeQuery()
      })

      return unsubscribe
    } catch (err) {
      // Database might not be initialized yet, ignore
      return undefined
    }
  }, [table, subscribe, executeQuery])

  return useMemo(() => ({
    data,
    isLoading,
    error,
    refetch
  }), [data, isLoading, error, refetch])
}

export interface UseSearchOptions extends Omit<SearchOptions, "table"> {
  table: string
  query: string
  deps?: unknown[]
  subscribe?: boolean
}

export interface UseSearchResult<T = any> {
  data: (T & { id: number; score: number })[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * React hook for reactive full-text search with automatic subscriptions
 * 
 * @example
 * ```tsx
 * const { data: searchResults, isLoading } = useSearch({
 *   table: "messages",
 *   query: searchTerm,
 *   limit: 20,
 *   deps: [searchTerm]
 * })
 * ```
 */
export function useSearch<T = any>(options: UseSearchOptions): UseSearchResult<T> {
  const [data, setData] = useState<(T & { id: number; score: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const { table, query, limit, timeRange, deps = [], subscribe = true, ...filters } = options

  // Create stable search options object
  const searchOptions = useMemo((): SearchOptions => ({
    table,
    limit: limit as number,
    timeRange: timeRange as [Date | string, Date | string] | undefined,
    ...filters
  }), [table, limit, timeRange, filters])

  // Execute search
  const executeSearch = useCallback(async () => {
    try {
      setError(null)
      
      // Skip search if query is empty
      if (!query.trim()) {
        setData([])
        setIsLoading(false)
        return
      }

      const db = Columnist.getDB()
      const results = await db.search<T>(query, searchOptions)
      setData(results)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Search failed"))
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [query, searchOptions])

  // Refetch function for manual updates
  const refetch = useCallback(async () => {
    setIsLoading(true)
    await executeSearch()
  }, [executeSearch])

  // Initial search and dependency updates
  useEffect(() => {
    setIsLoading(true)
    executeSearch()
  }, [executeSearch, ...deps])

  // Subscription for reactive updates
  useEffect(() => {
    if (!subscribe) return

    try {
      const db = Columnist.getDB()
      const unsubscribe = db.subscribe(table, (event) => {
        // Re-run search when table changes
        executeSearch()
      })

      return unsubscribe
    } catch (err) {
      // Database might not be initialized yet, ignore
      return undefined
    }
  }, [table, subscribe, executeSearch])

  return useMemo(() => ({
    data,
    isLoading,
    error,
    refetch
  }), [data, isLoading, error, refetch])
}
