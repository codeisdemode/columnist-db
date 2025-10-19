// Memory AI Module Exports

export { MemoryManager } from './manager';
export { MemoryScoring } from './scoring';
export { BasicEmbeddingProvider } from './embedding-providers/basic-embedding-provider';

export type {
  MemoryRecord,
  MemoryQueryOptions,
  MemorySearchResult,
  SearchResult,
  MemoryContext,
  MemoryImportanceScore,
  MemoryConsolidationConfig,
  DocumentRecord,
  DocumentChunk,
  DocumentSearchOptions,
  DocumentSearchResult,
  EmbeddingProvider,
  DocumentProcessingOptions
} from './types';