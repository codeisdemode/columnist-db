import { ColumnistDB } from '../columnist';
import { getDeviceManager } from './device-utils';

export interface SyncOptions {
  /** Sync interval in milliseconds (default: 5000) */
  interval?: number;
  /** Whether to enable real-time sync (default: false) */
  realtime?: boolean;
  /** Conflict resolution strategy (default: 'local-wins') */
  conflictStrategy?: 'local-wins' | 'remote-wins' | 'merge' | 'custom' | 'device-aware';
  /** Custom conflict resolver function */
  conflictResolver?: (local: any, remote: any) => any;
  /** Tables to sync (default: all tables) */
  tables?: string[];
  /** Maximum retry attempts for failed syncs (default: 3) */
  maxRetries?: number;
  /** Backoff strategy for retries (default: exponential) */
  backoffStrategy?: 'exponential' | 'linear' | 'fixed';
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  lastSync?: Date;
  error?: string;
  pendingChanges: number;
  tables: Record<string, TableSyncStatus>;
}

export interface TableSyncStatus {
  synced: number;
  pending: number;
  lastSync?: Date;
  error?: string;
}

export interface SyncEvent {
  type: 'sync-start' | 'sync-complete' | 'sync-error' | 'conflict' | 'change-detected';
  table?: string;
  data?: any;
  error?: Error;
}

export interface ChangeSet {
  inserts: any[];
  updates: any[];
  deletes: number[];
  timestamp: Date;
}

export abstract class BaseSyncAdapter {
  protected db: ColumnistDB;
  protected options: SyncOptions;
  protected status: SyncStatus;
  protected syncInterval?: NodeJS.Timeout;
  protected pendingChanges: Map<string, ChangeSet> = new Map();
  protected listeners: Set<(event: SyncEvent) => void> = new Set();
  protected deviceManager: import('./device-utils').DeviceManager;

  constructor(db: ColumnistDB, options: SyncOptions = {}) {
    this.db = db;
    this.options = {
      interval: 5000,
      realtime: false,
      conflictStrategy: 'local-wins',
      maxRetries: 3,
      backoffStrategy: 'exponential',
      ...options
    };
    
    this.status = {
      status: 'idle',
      pendingChanges: 0,
      tables: {}
    };
    
    this.deviceManager = getDeviceManager(db);
  }

  /**
   * Initialize the sync adapter
   */
  abstract initialize(): Promise<void>;

  /**
   * Push local changes to remote
   */
  abstract pushChanges(changes: ChangeSet): Promise<void>;

  /**
   * Pull remote changes
   */
  abstract pullChanges(): Promise<ChangeSet>;

  /**
   * Start synchronization
   */
  async start(): Promise<void> {
    try {
      await this.initialize();
      
      if (this.options.realtime) {
        await this.setupRealtimeListeners();
      }
      
      if (this.options.interval && this.options.interval > 0) {
        this.syncInterval = setInterval(() => this.sync(), this.options.interval);
      }
      
      // Initial sync
      await this.sync();
      
      this.emit({ type: 'sync-start' });
    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('Sync start failed') 
      });
      throw error;
    }
  }

  /**
   * Stop synchronization
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
    
    this.teardownRealtimeListeners();
    this.status.status = 'idle';
  }

  /**
   * Perform a sync operation
   */
  protected async sync(): Promise<void> {
    if (this.status.status === 'syncing') return;
    
    this.status.status = 'syncing';
    
    try {
      // Push local changes first
      const localChanges = this.collectLocalChanges();
      if (localChanges.inserts.length > 0 || localChanges.updates.length > 0 || localChanges.deletes.length > 0) {
        await this.pushChanges(localChanges);
        this.clearLocalChanges(localChanges);
      }
      
      // Pull remote changes
      const remoteChanges = await this.pullChanges();
      await this.applyRemoteChanges(remoteChanges);
      
      this.status.lastSync = new Date();
      this.status.status = 'idle';
      
      this.emit({ type: 'sync-complete' });
    } catch (error) {
      this.status.status = 'error';
      this.status.error = error instanceof Error ? error.message : 'Sync failed';
      
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('Sync failed') 
      });
    }
  }

  /**
   * Setup real-time change listeners
   */
  protected abstract setupRealtimeListeners(): Promise<void>;

  /**
   * Teardown real-time listeners
   */
  protected abstract teardownRealtimeListeners(): void;

  /**
   * Collect local changes that need to be synced
   */
  protected collectLocalChanges(): ChangeSet {
    const changes: ChangeSet = {
      inserts: [],
      updates: [],
      deletes: [],
      timestamp: new Date()
    };

    // Merge all pending changes
    for (const [table, changeSet] of this.pendingChanges) {
      changes.inserts.push(...changeSet.inserts.map(record => ({ ...record, _table: table })));
      changes.updates.push(...changeSet.updates.map(record => ({ ...record, _table: table })));
      changes.deletes.push(...changeSet.deletes);
    }

    return changes;
  }

  /**
   * Clear applied local changes
   */
  protected clearLocalChanges(appliedChanges: ChangeSet): void {
    // Implementation depends on specific change tracking
    this.pendingChanges.clear();
    this.status.pendingChanges = 0;
  }

  /**
   * Apply remote changes to local database
   */
  protected async applyRemoteChanges(changes: ChangeSet): Promise<void> {
    for (const insert of changes.inserts) {
      const { _table, ...record } = insert;
      if (_table) {
        // Check for potential conflicts with existing records
        try {
          const existing = await this.db.find({
            table: _table,
            where: { id: record.id }
          });

          if (existing.length > 0) {
            // Conflict detected - resolve it
            const resolved = this.resolveConflict(existing[0], record);
            await this.db.update(record.id, resolved, _table);
          } else {
            // No conflict, insert normally
            await this.db.upsert(record, _table);
          }
        } catch (error) {
          console.warn('Failed to handle insert conflict:', error);
          await this.db.upsert(record, _table);
        }
      }
    }

    for (const update of changes.updates) {
      const { _table, id, ...updates } = update;
      if (_table && id) {
        try {
          // Get current local version
          const localRecord = await this.db.find({
            table: _table,
            where: { id }
          });

          if (localRecord.length > 0 && this.hasConflict(localRecord[0], update)) {
            // Conflict detected - resolve it
            const resolved = this.resolveConflict(localRecord[0], { ...updates, id });
            await this.db.update(id, resolved, _table);
          } else {
            // No conflict, update normally
            await this.db.update(id, updates, _table);
          }
        } catch (error) {
          console.warn('Failed to handle update conflict:', error);
          await this.db.update(id, updates, _table);
        }
      }
    }

    for (const del of changes.deletes) {
      if (typeof del === 'object' && '_table' in del && 'id' in del) {
        await this.db.delete((del as any).id, (del as any)._table);
      } else if (typeof del === 'number') {
        // Handle simple numeric IDs (fallback)
        console.warn('Simple numeric delete ID without table specified');
      }
    }
  }

  /**
   * Resolve conflicts between local and remote changes
   */
  protected resolveConflict(local: any, remote: any): any {
    // Emit conflict event for monitoring
    this.emit({
      type: 'conflict',
      data: { local, remote }
    });

    // Enhanced conflict resolution with device awareness
    if (this.options.conflictStrategy === 'device-aware') {
      return this.resolveDeviceAwareConflict(local, remote);
    }

    switch (this.options.conflictStrategy) {
      case 'local-wins':
        return local;
      case 'remote-wins':
        return remote;
      case 'merge':
        return this.mergeRecords(local, remote);
      case 'custom':
        if (this.options.conflictResolver) {
          return this.options.conflictResolver(local, remote);
        }
        // Fall through to local-wins if no custom resolver
      default:
        return local;
    }
  }

  /**
   * Device-aware conflict resolution that considers device online status
   */
  protected async resolveDeviceAwareConflict(local: any, remote: any): Promise<any> {
    try {
      // Extract device information from records if available
      const localDeviceId = local._deviceId || local.deviceId;
      const remoteDeviceId = remote._deviceId || remote.deviceId;
      
      // If we have device IDs, check their online status
      if (localDeviceId && remoteDeviceId) {
        const [localStatus, remoteStatus] = await Promise.all([
          this.deviceManager.getDeviceStatus(localDeviceId),
          this.deviceManager.getDeviceStatus(remoteDeviceId)
        ]);
        
        // Prefer changes from online devices over offline devices
        if (localStatus === 'online' && remoteStatus === 'offline') {
          return local;
        } else if (localStatus === 'offline' && remoteStatus === 'online') {
          return remote;
        }
        
        // If both online or both offline, fall back to timestamp-based resolution
      }
      
      // Fall back to timestamp-based resolution
      return this.resolveTimestampConflict(local, remote);
      
    } catch (error) {
      console.warn('Device-aware conflict resolution failed, falling back to timestamp:', error);
      return this.resolveTimestampConflict(local, remote);
    }
  }

  /**
   * Timestamp-based conflict resolution (fallback)
   */
  protected resolveTimestampConflict(local: any, remote: any): any {
    const localTime = this.getRecordTimestamp(local);
    const remoteTime = this.getRecordTimestamp(remote);
    
    if (localTime && remoteTime) {
      return localTime > remoteTime ? local : remote;
    }
    
    // If no timestamps available, use local wins as default
    return local;
  }

  /**
   * Extract timestamp from record using common field patterns
   */
  protected getRecordTimestamp(record: any): number | null {
    const timestampFields = ['_lastModified', 'updatedAt', 'createdAt', 'timestamp', 'lastUpdated'];
    
    for (const field of timestampFields) {
      if (record[field]) {
        const date = new Date(record[field]);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }
    
    return null;
  }

  /**
   * Smart merge strategy that handles common conflict scenarios
   */
  protected mergeRecords(local: any, remote: any): any {
    const merged = { ...local, ...remote };
    
    // Handle timestamp conflicts - use the latest timestamp
    if (local._lastModified && remote._lastModified) {
      const localTime = new Date(local._lastModified).getTime();
      const remoteTime = new Date(remote._lastModified).getTime();
      merged._lastModified = localTime > remoteTime 
        ? local._lastModified 
        : remote._lastModified;
    }
    
    // Handle version conflicts - use higher version
    if (local._version !== undefined && remote._version !== undefined) {
      merged._version = Math.max(local._version, remote._version);
    }
    
    // Mark as merged
    merged._merged = true;
    merged._mergedAt = new Date().toISOString();
    
    return merged;
  }

  /**
   * Detect if two records have conflicting changes
   */
  protected hasConflict(local: any, remote: any): boolean {
    if (!local || !remote) return false;
    
    // Simple timestamp-based conflict detection
    if (local._lastModified && remote._lastModified) {
      const localTime = new Date(local._lastModified).getTime();
      const remoteTime = new Date(remote._lastModified).getTime();
      
      // Consider it a conflict if both records were modified around the same time
      const timeDiff = Math.abs(localTime - remoteTime);
      return timeDiff < 5000; // 5 second window for conflicts
    }
    
    // Version-based conflict detection
    if (local._version !== undefined && remote._version !== undefined) {
      return local._version === remote._version;
    }
    
    // Default: no conflict detection
    return false;
  }

  /**
   * Track local changes for synchronization
   */
  trackChange(table: string, type: 'insert' | 'update' | 'delete', record: any): void {
    if (!this.pendingChanges.has(table)) {
      this.pendingChanges.set(table, {
        inserts: [],
        updates: [],
        deletes: [],
        timestamp: new Date()
      });
    }

    const changes = this.pendingChanges.get(table)!;
    
    switch (type) {
      case 'insert':
        changes.inserts.push(record);
        break;
      case 'update':
        changes.updates.push(record);
        break;
      case 'delete':
        changes.deletes.push(record.id);
        break;
    }

    this.status.pendingChanges++;
    this.emit({ 
      type: 'change-detected', 
      table, 
      data: { type, record } 
    });
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Add sync event listener
   */
  onSyncEvent(listener: (event: SyncEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Add event listener (alias for onSyncEvent)
   */
  on(event: string, listener: (event: SyncEvent) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: (event: SyncEvent) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Emit sync event
   */
  protected emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('Sync event listener error:', error);
      }
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.pendingChanges.clear();
  }
}