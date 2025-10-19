"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { type DocumentSearchOptions, type DocumentSearchResult } from "columnist-db-core"

interface UseDocumentSearchOptions extends Omit<DocumentSearchOptions, 'limit'> {
  memoryManager?: any
  debounceMs?: number
  autoSearch?: boolean
}

interface UseDocumentSearchResult {
  results: DocumentSearchResult[]
  isLoading: boolean
  error: Error | null
  search: (query: string) => Promise<void>
  clearResults: () => void
  hasResults: boolean
  totalResults: number
  searchQuery: string
}

/**
 * React hook for document search with RAG workflows
 *
 * @example
 * ```tsx
 * const { results, isLoading, search, hasResults } = useDocumentSearch({
 *   memoryManager: memoryManager,
 *   searchStrategy: 'hybrid',
 *   includeHighlights: true,
 *   autoSearch: true
 * })
 *
 * // Search for documents
 * search("machine learning algorithms")
 *
 * // Display results
 * {hasResults && results.map(result => (
 *   <div key={result.memory.id}>
 *     <h3>{result.memory.content.slice(0, 100)}...</h3>
 *     <p>Relevance: {(result.relevance * 100).toFixed(1)}%</p>
 *   </div>
 * ))}
 * ```
 */
export type { UseDocumentSearchOptions, UseDocumentSearchResult }

export function useDocumentSearch(options: UseDocumentSearchOptions): UseDocumentSearchResult {
  const {
    memoryManager,
    debounceMs = 300,
    autoSearch = false,
    ...searchOptions
  } = options

  const [results, setResults] = useState<DocumentSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null)

  // Clear results
  const clearResults = useCallback(() => {
    setResults([])
    setSearchQuery("")
    setError(null)
  }, [])

  // Perform search
  const performSearch = useCallback(async (query: string) => {
    if (!memoryManager || !query.trim()) {
      setResults([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const searchResults = await memoryManager.searchDocuments(query, {
        ...searchOptions,
        limit: 10
      })
      setResults(searchResults)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Search failed"))
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [memoryManager, searchOptions])

  // Debounced search
  const search = useCallback((query: string) => {
    setSearchQuery(query)

    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    const timeout = setTimeout(() => {
      performSearch(query)
    }, debounceMs)

    setDebounceTimeout(timeout)

    return Promise.resolve()
  }, [debounceMs, debounceTimeout, performSearch])

  // Auto-search when query changes (if enabled)
  useEffect(() => {
    if (autoSearch && searchQuery.trim()) {
      performSearch(searchQuery)
    }
  }, [autoSearch, searchQuery, performSearch])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout)
      }
    }
  }, [debounceTimeout])

  const hasResults = useMemo(() => results.length > 0, [results])
  const totalResults = useMemo(() => results.length, [results])

  return {
    results,
    isLoading,
    error,
    search,
    clearResults,
    hasResults,
    totalResults,
    searchQuery
  }
}