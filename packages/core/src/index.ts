export { Columnist, defineTable } from './columnist';
export type { SchemaDefinition } from './columnist';
export type { 
  TableDefinition, 
  SearchOptions, 
  FindOptions,
  InsertResult,
  BulkOperationResult,
  WhereCondition,
  InferTableType
} from './types';

export { SyncManager, BaseSyncAdapter } from './sync';
export type { 
  SyncConfig,
  SyncAdapterConstructor,
  SyncMetadata,
  SyncOperation,
  SyncBatch,
  Conflict,
  RetryConfig,
  SyncHealth,
  SyncMetrics,
  SyncHook,
  SyncHooks
} from './sync/types';

export type { SyncOptions, SyncStatus, SyncEvent, ChangeSet } from './sync/base-adapter';

// Memory AI features
// export { ColumnistMCPServer } from './mcp';
// export type { MCPConfig, MCPResource, MCPTool } from './mcp';

export { MemoryManager, MemoryScoring, BasicEmbeddingProvider } from './memory';
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
} from './memory';