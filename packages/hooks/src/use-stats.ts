"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Columnist } from "columnist-db-core"

export interface UseStatsOptions {
  table?: string
  // How often to refresh stats (in milliseconds, default: 5000)
  refreshInterval?: number
  // Dependencies that should trigger re-fetch
  deps?: unknown[]
}

export interface TableStats {
  count: number
  totalBytes: number
}

export interface OverallStats {
  totalTables: number
  tables: Record<string, TableStats>
  overallBytes: number
}

export interface UseStatsResult {
  stats: TableStats | OverallStats | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * React hook for reactive database statistics
 * 
 * @example
 * ```tsx
 * // Overall stats
 * const { stats: overallStats } = useStats()
 * 
 * // Table-specific stats
 * const { stats: messageStats } = useStats({ table: "messages" })
 * 
 * // With custom refresh interval
 * const { stats, refetch } = useStats({ 
 *   table: "messages", 
 *   refreshInterval: 10000 
 * })
 * ```
 */
export function useStats(options: UseStatsOptions = {}): UseStatsResult {
  const [stats, setStats] = useState<TableStats | OverallStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const { table, refreshInterval = 5000, deps = [] } = options

  // Execute stats query
  const executeQuery = useCallback(async () => {
    try {
      setError(null)
      const db = Columnist.getDB()
      const result = await db.getStats(table)
      setStats(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch stats"))
      setStats(null)
    } finally {
      setIsLoading(false)
    }
  }, [table])

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

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return

    const interval = setInterval(() => {
      executeQuery()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [executeQuery, refreshInterval])

  // Subscribe to database changes for reactive updates
  useEffect(() => {
    try {
      const db = Columnist.getDB()
      
      if (table) {
        // Subscribe to specific table changes
        const unsubscribe = db.subscribe(table, () => {
          executeQuery()
        })
        return unsubscribe
      } else {
        // Subscribe to all table changes for overall stats
        // This is a simplified approach - in a real implementation,
        // you might want to subscribe to all known tables
        return undefined
      }
    } catch (err) {
      // Database might not be initialized yet, ignore
      return undefined
    }
  }, [table, executeQuery])

  return useMemo(() => ({
    stats,
    isLoading,
    error,
    refetch
  }), [stats, isLoading, error, refetch])
}

/**
 * Helper hook to get memory usage estimation
 */
export function useMemoryUsage(): {
  estimatedRAM: string
  isLoading: boolean
} {
  const { stats, isLoading } = useStats()
  
  const estimatedRAM = useMemo(() => {
    if (!stats || isLoading) return "..."
    
    if ("overallBytes" in stats) {
      // Overall stats - estimate based on total bytes
      const bytes = stats.overallBytes
      const ramEstimate = bytes * 0.1 // Very rough estimate: 10% of storage size
      return formatBytes(ramEstimate)
    } else {
      // Single table stats
      const bytes = stats.totalBytes
      const ramEstimate = bytes * 0.1
      return formatBytes(ramEstimate)
    }
  }, [stats, isLoading])

  return { estimatedRAM, isLoading }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
