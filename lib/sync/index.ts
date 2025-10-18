export * from './base-adapter';
export * from './types';

// Export adapter types separately to avoid circular dependencies
export type { FirebaseSyncAdapter } from './adapters/firebase-adapter';
export type { SupabaseSyncAdapter } from './adapters/supabase-adapter';
export type { RESTfulSyncAdapter } from './adapters/rest-adapter';

import { ColumnistDB } from '../columnist';
import { BaseSyncAdapter, SyncOptions } from './base-adapter';
import { getDeviceManager } from './device-utils';

export class SyncManager {
  private adapters: Map<string, BaseSyncAdapter> = new Map();
  private db: ColumnistDB;
  private deviceManager: import('./device-utils').DeviceManager;

  constructor(db: ColumnistDB) {
    this.db = db;
    this.deviceManager = getDeviceManager(db);
  }

  /**
   * Register a sync adapter
   */
  registerAdapter(name: string, adapter: BaseSyncAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * Get a sync adapter by name
   */
  getAdapter(name: string): BaseSyncAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): BaseSyncAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Remove a sync adapter
   */
  removeAdapter(name: string): void {
    const adapter = this.adapters.get(name);
    if (adapter) {
      adapter.dispose();
      this.adapters.delete(name);
    }
  }

  /**
   * Start all registered sync adapters
   */
  async startAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.values()).map(adapter => adapter.start())
    );

    const errors = results.filter(result => result.status === 'rejected');
    if (errors.length > 0) {
      console.warn('Some sync adapters failed to start:', errors);
    }
  }

  /**
   * Stop all sync adapters
   */
  stopAll(): void {
    for (const adapter of this.adapters.values()) {
      adapter.stop();
    }
  }

  /**
   * Get status of all sync adapters
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [name, adapter] of this.adapters) {
      status[name] = adapter.getStatus();
    }
    return status;
  }

  /**
   * Get device manager instance
   */
  getDeviceManager(): import('./device-utils').DeviceManager {
    return this.deviceManager;
  }

  /**
   * Get online devices across all sync adapters
   */
  async getOnlineDevices(): Promise<import('./device-utils').DeviceInfo[]> {
    return this.deviceManager.getOnlineDevices();
  }

  /**
   * Get device status
   */
  async getDeviceStatus(deviceId: string): Promise<'online' | 'offline'> {
    return this.deviceManager.getDeviceStatus(deviceId);
  }

  /**
   * Start device presence tracking
   */
  async startDevicePresenceTracking(heartbeatInterval: number = 30000): Promise<void> {
    return this.deviceManager.startPresenceTracking(heartbeatInterval);
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stopAll();
    for (const adapter of this.adapters.values()) {
      adapter.dispose();
    }
    this.adapters.clear();
  }
}

/**
 * Helper function to create and register a sync adapter
 */
export function createSyncAdapter(
  db: ColumnistDB,
  type: 'firebase' | 'supabase' | 'rest',
  options: any & { name: string }
): BaseSyncAdapter {
  let adapter: BaseSyncAdapter;

  switch (type) {
    case 'firebase':
      // Dynamic import to avoid circular dependencies
      const firebaseModule = require('./adapters/firebase-adapter');
      adapter = new firebaseModule.FirebaseSyncAdapter(db, options);
      break;
    case 'supabase':
      const supabaseModule = require('./adapters/supabase-adapter');
      adapter = new supabaseModule.SupabaseSyncAdapter(db, options);
      break;
    case 'rest':
      const restModule = require('./adapters/rest-adapter');
      adapter = new restModule.RESTfulSyncAdapter(db, options);
      break;
    default:
      throw new Error(`Unsupported sync adapter type: ${type}`);
  }

  return adapter;
}