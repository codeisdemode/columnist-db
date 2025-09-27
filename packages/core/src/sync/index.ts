export { SyncManager } from './sync-manager';
export { BaseSyncAdapter } from './base-adapter';
export { RESTfulSyncAdapter } from './adapters/rest-adapter';
export { FirebaseSyncAdapter } from './adapters/firebase-adapter';
export { SupabaseSyncAdapter } from './adapters/supabase-adapter';

export function createSyncAdapter(db: any, type: string, options: any): any {
  switch (type) {
    case 'rest':
      return new (require('./adapters/rest-adapter').RESTfulSyncAdapter)(db, options);
    case 'firebase':
      return new (require('./adapters/firebase-adapter').FirebaseSyncAdapter)(db, options);
    case 'supabase':
      return new (require('./adapters/supabase-adapter').SupabaseSyncAdapter)(db, options);
    default:
      throw new Error(`Unknown sync adapter type: ${type}`);
  }
}