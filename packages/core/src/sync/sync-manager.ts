import { ColumnistDB } from '../columnist';
import { BaseSyncAdapter, SyncOptions, SyncStatus, SyncEvent } from './base-adapter';
import { SyncConfig, SyncAdapterConstructor } from './types';
import { DeviceManager } from './device-utils';

export class SyncManager {
  private db: ColumnistDB;
  private adapters: Map<string, BaseSyncAdapter> = new Map();
  private configs: Map<string, SyncConfig> = new Map();
  private isRunning: boolean = false;
  private deviceManager: DeviceManager | null = null;

  constructor(db: ColumnistDB) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    // Only initialize device manager if sync is enabled
    // TODO: Add getOptions method to ColumnistDB or access sync config differently
    // if (this.db.getOptions()?.sync?.enabled !== false) {
    this.deviceManager = new DeviceManager(this.db);
    await this.deviceManager.initialize();
    // }
  }

  registerAdapter(name: string, adapter: BaseSyncAdapter): void {
    this.adapters.set(name, adapter);
  }

  getAdapter(name: string): BaseSyncAdapter | undefined {
    return this.adapters.get(name);
  }

  getAllAdapters(): BaseSyncAdapter[] {
    return Array.from(this.adapters.values());
  }

  async startAll(): Promise<void> {
    this.isRunning = true;
    for (const adapter of this.adapters.values()) {
      await adapter.start();
    }
  }

  async stopAll(): Promise<void> {
    this.isRunning = false;
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
  }

  getStatus(): SyncStatus {
    const status: SyncStatus = {
      status: this.isRunning ? 'syncing' : 'idle',
      pendingChanges: 0,
      tables: {}
    };

    for (const [name, adapter] of this.adapters) {
      const adapterStatus = adapter.getStatus();
      status.pendingChanges += adapterStatus.pendingChanges;
      status.tables[name] = adapterStatus.tables[name] || {
        synced: 0,
        pending: 0
      };
    }

    return status;
  }

  on(event: string, listener: (event: SyncEvent) => void): void {
    for (const adapter of this.adapters.values()) {
      adapter.on(event, listener);
    }
  }

  off(event: string, listener: (event: SyncEvent) => void): void {
    for (const adapter of this.adapters.values()) {
      adapter.off(event, listener);
    }
  }
}