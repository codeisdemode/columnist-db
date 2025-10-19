"use client"

import { useState, useCallback, useEffect } from "react"
import { type DocumentProcessingOptions } from "columnist-db-core"

interface DocumentState {
  id: string
  content: string
  metadata?: Record<string, any>
  status: 'idle' | 'processing' | 'success' | 'error'
  chunks?: any[]
  error?: string
}

interface UseDocumentManagementOptions {
  memoryManager?: any
  autoLoadChunks?: boolean
}

interface UseDocumentManagementResult {
  documents: DocumentState[]
  isLoading: boolean
  error: Error | null
  addDocument: (content: string, metadata?: Record<string, any>, options?: DocumentProcessingOptions) => Promise<string>
  getDocumentChunks: (documentId: string) => Promise<any[]>
  removeDocument: (documentId: string) => void
  clearDocuments: () => void
  refreshDocument: (documentId: string) => Promise<void>
  hasDocuments: boolean
  totalDocuments: number
}

/**
 * React hook for document management with state tracking
 *
 * @example
 * ```tsx
 * const { documents, addDocument, isLoading } = useDocumentManagement({
 *   memoryManager: memoryManager,
 *   autoLoadChunks: true
 * })
 *
 * // Add a document
 * const handleAddDocument = async () => {
 *   const docId = await addDocument(
 *     "Document content here...",
 *     { category: "research", tags: ["ai", "ml"] },
 *     { chunkingStrategy: "semantic" }
 *   )
 * }
 *
 * // Display documents
 * {documents.map(doc => (
 *   <div key={doc.id} className={doc.status}>
 *     <h3>{doc.content.slice(0, 100)}...</h3>
 *     <p>Status: {doc.status}</p>
 *     {doc.chunks && <p>Chunks: {doc.chunks.length}</p>}
 *   </div>
 * ))}
 * ```
 */
export type { UseDocumentManagementOptions, UseDocumentManagementResult, DocumentState }

export function useDocumentManagement(options: UseDocumentManagementOptions): UseDocumentManagementResult {
  const { memoryManager, autoLoadChunks = false } = options

  const [documents, setDocuments] = useState<DocumentState[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Add a document
  const addDocument = useCallback(async (
    content: string,
    metadata?: Record<string, any>,
    options?: DocumentProcessingOptions
  ): Promise<string> => {
    if (!memoryManager) {
      throw new Error("Memory manager not initialized")
    }

    setIsLoading(true)
    setError(null)

    const documentState: DocumentState = {
      id: `temp_${Date.now()}`,
      content,
      metadata,
      status: 'processing'
    }

    setDocuments(prev => [...prev, documentState])

    try {
      const documentId = await memoryManager.addDocument(content, metadata, options)

      // Update document state with real ID
      setDocuments(prev => prev.map(doc =>
        doc.id === documentState.id
          ? { ...doc, id: documentId, status: 'success' as const }
          : doc
      ))

      // Auto-load chunks if enabled
      if (autoLoadChunks) {
        const chunks = await memoryManager.getDocumentChunks(documentId)
        setDocuments(prev => prev.map(doc =>
          doc.id === documentId
            ? { ...doc, chunks }
            : doc
        ))
      }

      return documentId
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to add document")

      // Update document state with error
      setDocuments(prev => prev.map(doc =>
        doc.id === documentState.id
          ? { ...doc, status: 'error' as const, error: error.message }
          : doc
      ))

      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [memoryManager, autoLoadChunks])

  // Get document chunks
  const getDocumentChunks = useCallback(async (documentId: string): Promise<any[]> => {
    if (!memoryManager) {
      throw new Error("Memory manager not initialized")
    }

    try {
      const chunks = await memoryManager.getDocumentChunks(documentId)

      // Update document state with chunks
      setDocuments(prev => prev.map(doc =>
        doc.id === documentId
          ? { ...doc, chunks }
          : doc
      ))

      return chunks
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to get document chunks")
      setError(error)
      throw error
    }
  }, [memoryManager])

  // Remove a document from state (doesn't delete from database)
  const removeDocument = useCallback((documentId: string): void => {
    setDocuments(prev => prev.filter(doc => doc.id !== documentId))
  }, [])

  // Clear all documents from state
  const clearDocuments = useCallback((): void => {
    setDocuments([])
    setError(null)
  }, [])

  // Refresh document data
  const refreshDocument = useCallback(async (documentId: string): Promise<void> => {
    if (!memoryManager) {
      throw new Error("Memory manager not initialized")
    }

    try {
      const chunks = await memoryManager.getDocumentChunks(documentId)
      setDocuments(prev => prev.map(doc =>
        doc.id === documentId
          ? { ...doc, chunks }
          : doc
      ))
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to refresh document")
      setError(error)
      throw error
    }
  }, [memoryManager])

  const hasDocuments = documents.length > 0
  const totalDocuments = documents.length

  return {
    documents,
    isLoading,
    error,
    addDocument,
    getDocumentChunks,
    removeDocument,
    clearDocuments,
    refreshDocument,
    hasDocuments,
    totalDocuments
  }
}