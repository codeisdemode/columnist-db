import { BaseSyncAdapter, SyncOptions } from 'columnist-db-core';
import type { ConvexClient } from 'convex/browser';

export interface ConvexSyncOptions extends SyncOptions {
  db: any; // Database instance
  convexClient: ConvexClient;
  mutationName?: string;
  queryName?: string;
}

export class ConvexSyncAdapter extends BaseSyncAdapter {
  private convexClient: ConvexClient;
  private mutationName: string;
  private queryName: string;

  constructor(options: ConvexSyncOptions) {
    super(options.db, options);
    this.convexClient = options.convexClient;
    this.mutationName = options.mutationName || 'syncColumnistData';
    this.queryName = options.queryName || 'getColumnistData';
  }

  async initialize(): Promise<void> {
    // Initialize convex connection
  }

  async pushChanges(changes: any): Promise<void> {
    try {
      // For convex, we need to use a proper mutation reference
      // This is a simplified implementation - in real usage, you'd import the actual mutation
      if (typeof this.convexClient.mutation === 'function') {
        await (this.convexClient as any).mutation(this.mutationName, { data: changes });
      }
    } catch (error) {
      console.error('Convex sync error:', error);
      throw error;
    }
  }

  async pullChanges(): Promise<any> {
    try {
      // For convex, we need to use a proper query reference
      // This is a simplified implementation - in real usage, you'd import the actual query
      if (typeof this.convexClient.query === 'function') {
        const result = await (this.convexClient as any).query(this.queryName, {});
        return result || { inserts: [], updates: [], deletes: [], timestamp: new Date() };
      }
      return { inserts: [], updates: [], deletes: [], timestamp: new Date() };
    } catch (error) {
      console.error('Convex query error:', error);
      return { inserts: [], updates: [], deletes: [], timestamp: new Date() };
    }
  }

  protected async setupRealtimeListeners(): Promise<void> {
    // Subscribe to convex changes
    if (typeof (this.convexClient as any).onUpdate === 'function') {
      (this.convexClient as any).onUpdate(this.queryName, {}, (data: any) => {
        this.handleIncomingData(data);
      });
    }
  }

  protected teardownRealtimeListeners(): void {
    // Clean up convex subscriptions
  }

  private handleIncomingData(data: any): void {
    this.emit({ type: 'change-detected', data });
  }

  getStatus(): any {
    const baseStatus = super.getStatus();
    
    // For convex, we'll assume connected if no errors occur
    // Actual connection state checking would require more complex logic
    return {
      ...baseStatus,
      convexConnected: baseStatus.status !== 'error',
      lastSync: baseStatus.lastSync
    };
  }
}