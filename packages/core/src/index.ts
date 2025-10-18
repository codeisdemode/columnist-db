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

// MCP and Memory AI features available but not exported in v1.2.3
// Will be fully integrated in next major version
// export { ColumnistMCPServer } from './mcp';
// export type { MCPConfig, MCPResource, MCPTool } from './mcp';

// export { MemoryManager } from './memory';
// export { MemoryMCPTools } from './memory';
// export type { 
//   MemoryRecord, 
//   MemoryQueryOptions, 
//   MemorySearchResult, 
//   MemoryContext,
//   MemoryImportanceScore,
//   MemoryConsolidationConfig
// } from './memory';