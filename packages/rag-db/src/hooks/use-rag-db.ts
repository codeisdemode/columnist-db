import { useState, useEffect, useCallback } from 'react';
import { RAGDatabase } from '../rag-database';
import { RAGDatabaseOptions, Document, SearchResult, RAGStats } from '../types';

export interface UseRAGDBResult {
  db: RAGDatabase | null;
  isLoading: boolean;
  error: string | null;
  addDocument: (content: string, metadata?: Record<string, any>) => Promise<string>;
  search: (query: string, options?: any) => Promise<SearchResult[]>;
  getStats: () => Promise<RAGStats>;
  clear: () => Promise<void>;
}

export function useRAGDB(options: Partial<RAGDatabaseOptions> = {}): UseRAGDBResult {
  const [db, setDb] = useState<RAGDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initializeDB = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const ragDB = new RAGDatabase(options);
        await ragDB.initialize();

        if (mounted) {
          setDb(ragDB);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize RAG database');
          setIsLoading(false);
        }
      }
    };

    initializeDB();

    return () => {
      mounted = false;
    };
  }, [JSON.stringify(options)]);

  const addDocument = useCallback(async (content: string, metadata?: Record<string, any>) => {
    if (!db) {
      throw new Error('RAG database not initialized');
    }
    return await db.addDocument(content, metadata);
  }, [db]);

  const search = useCallback(async (query: string, searchOptions?: any) => {
    if (!db) {
      throw new Error('RAG database not initialized');
    }
    return await db.search(query, searchOptions);
  }, [db]);

  const getStats = useCallback(async () => {
    if (!db) {
      throw new Error('RAG database not initialized');
    }
    return await db.getStats();
  }, [db]);

  const clear = useCallback(async () => {
    if (!db) {
      throw new Error('RAG database not initialized');
    }
    return await db.clear();
  }, [db]);

  return {
    db,
    isLoading,
    error,
    addDocument,
    search,
    getStats,
    clear
  };
}