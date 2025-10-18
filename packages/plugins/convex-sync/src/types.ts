import type { SyncOptions } from 'columnist-db-core';
import type { ConvexClient } from 'convex/browser';

export interface ConvexSyncOptions extends SyncOptions {
  convexClient: ConvexClient;
  mutationName?: string;
  queryName?: string;
}