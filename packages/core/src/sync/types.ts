import { ColumnistDB } from '../columnist';
import { SyncOptions, BaseSyncAdapter } from './base-adapter';

export interface SyncConfig {
  /** Adapter type */
  type: 'firebase' | 'supabase' | 'rest' | 'custom';
  /** Adapter-specific configuration */
  config: any;
  /** Sync options */
  options?: SyncOptions;
}

export interface SyncAdapterConstructor {
  new (db: ColumnistDB, options: any): BaseSyncAdapter;
}

export interface SyncMetadata {
  /** Last sync timestamp */
  lastSync: Date;
  /** Sync version for conflict resolution */
  version: number;
  /** Source identifier */
  source: string;
  /** Additional metadata */
  [key: string]: any;
}

export interface SyncOperation {
  type: 'insert' | 'update' | 'delete';
  table: string;
  record: any;
  timestamp: Date;
  metadata?: SyncMetadata;
}

export interface SyncBatch {
  operations: SyncOperation[];
  timestamp: Date;
  batchId: string;
}

export interface Conflict {
  local: any;
  remote: any;
  table: string;
  key: string | number;
  timestamp: Date;
}

export interface RetryConfig {
  maxAttempts: number;
  delay: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  maxDelay?: number;
}

export interface SyncHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastSuccessfulSync?: Date;
  errorRate: number;
  latency: number;
  throughput: number;
}

export interface SyncMetrics {
  syncs: number;
  conflicts: number;
  errors: number;
  bytesTransferred: number;
  averageLatency: number;
}

export interface SyncHook {
  (operation: SyncOperation, context: {
    db: ColumnistDB;
    adapter: BaseSyncAdapter;
  }): Promise<boolean> | boolean;
}

export interface SyncHooks {
  beforeSync?: SyncHook;
  afterSync?: SyncHook;
  beforePush?: SyncHook;
  afterPush?: SyncHook;
  beforePull?: SyncHook;
  afterPull?: SyncHook;
  onConflict?: (conflict: Conflict) => Promise<any>;
}