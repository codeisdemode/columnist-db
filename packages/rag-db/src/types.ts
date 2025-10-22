import { z } from 'zod';

export const RAGDatabaseOptionsSchema = z
  .object({
    name: z.string().default('rag-db'),
    embeddingModel: z
      .enum(['auto', 'text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'])
      .default('auto'),
    chunkingStrategy: z.enum(['semantic', 'fixed', 'recursive']).default('semantic'),
    searchStrategy: z.enum(['hybrid', 'semantic', 'keyword']).default('hybrid'),
    apiKey: z.string().optional(),
    syncEnabled: z.boolean().default(false),
    syncAdapter: z.enum(['firebase', 'supabase', 'rest', 'convex']).optional(),
    syncConfig: z.record(z.string(), z.any()).optional(),
    cacheDurationMs: z.number().int().nonnegative().default(60_000),
    cacheMaxEntries: z.number().int().positive().default(100),
  })
  .passthrough();

export interface EmbeddingProviderLike {
  generateEmbedding(text: string): Promise<Float32Array>;
  getDimensions(): number;
  getModel(): string;
}

type BaseRAGDatabaseOptions = z.infer<typeof RAGDatabaseOptionsSchema>;

export type RAGDatabaseOptions = BaseRAGDatabaseOptions & {
  embeddingProvider?: EmbeddingProviderLike;
};

export type RAGDatabaseInitOptions = Partial<Omit<RAGDatabaseOptions, 'embeddingProvider'>> & {
  embeddingProvider?: EmbeddingProviderLike;
};

export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embeddings?: Float32Array;
  chunkId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResult {
  document: Document;
  score: number;
  relevance: 'high' | 'medium' | 'low';
  highlights?: string[];
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  includeHighlights?: boolean;
  filters?: Record<string, any>;
}

export interface ChunkingResult {
  chunks: string[];
  metadata: Record<string, any>;
}

export interface RAGStats {
  totalDocuments: number;
  totalChunks: number;
  embeddingModel: string;
  searchPerformance: {
    avgResponseTime: number;
    totalQueries: number;
    cacheHitRate: number;
  };
}