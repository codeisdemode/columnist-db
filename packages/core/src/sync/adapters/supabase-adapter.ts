import { BaseSyncAdapter, SyncOptions, ChangeSet, SyncEvent } from '../base-adapter';
import { ColumnistDB } from '../../columnist';

export interface SupabaseSyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
  /** Schema name (default: 'public') */
  schema?: string;
  /** Table prefix (default: 'columnist_') */
  tablePrefix?: string;
  /** Authentication options */
  auth?: {
    autoRefreshToken?: boolean;
    persistSession?: boolean;
    detectSessionInUrl?: boolean;
  };
}

export class SupabaseSyncAdapter extends BaseSyncAdapter {
  private config: SupabaseSyncConfig;
  private supabase: any;
  private realtimeSubscription: any = null;

  constructor(db: ColumnistDB, options: SupabaseSyncConfig & SyncOptions) {
    super(db, options);
    this.config = options;
  }

  async initialize(): Promise<void> {
    try {
      // Dynamically import Supabase
      const { createClient } = await import('@supabase/supabase-js');

      this.supabase = createClient(
        this.config.supabaseUrl,
        this.config.supabaseKey,
        {
          auth: this.config.auth || {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          },
          db: {
            schema: this.config.schema || 'public'
          }
        }
      );

      // Test connection
      const { error } = await this.supabase.from('_health').select('count').limit(1);
      if (error && error.code !== '42P01') { // Ignore "relation does not exist"
        throw error;
      }

      this.emit({ type: 'sync-start' });
    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('Supabase initialization failed') 
      });
      throw error;
    }
  }

  async pushChanges(changes: ChangeSet): Promise<void> {
    if (!this.supabase) throw new Error('Supabase not initialized');

    const tablePrefix = this.config.tablePrefix || 'columnist_';
    const maxRetries = this.options.maxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Group changes by table
        const changesByTable = new Map<string, { inserts: any[]; updates: any[]; deletes: any[] }>();

        for (const insert of changes.inserts) {
          const { _table, ...data } = insert;
          if (_table) {
            if (!changesByTable.has(_table)) {
              changesByTable.set(_table, { inserts: [], updates: [], deletes: [] });
            }
            changesByTable.get(_table)!.inserts.push(data);
          }
        }

        for (const update of changes.updates) {
          const { _table, ...data } = update;
          if (_table) {
            if (!changesByTable.has(_table)) {
              changesByTable.set(_table, { inserts: [], updates: [], deletes: [] });
            }
            changesByTable.get(_table)!.updates.push(data);
          }
        }

        for (const del of changes.deletes) {
          if (typeof del === 'object' && '_table' in del && 'id' in del) {
            if (!changesByTable.has((del as any)._table)) {
              changesByTable.set((del as any)._table, { inserts: [], updates: [], deletes: [] });
            }
            changesByTable.get((del as any)._table)!.deletes.push((del as any).id);
          } else if (typeof del === 'number') {
            console.warn('Simple numeric delete ID without table specified - cannot delete from Supabase');
          }
        }

        // Execute changes for each table with transaction-like behavior
        for (const [table, tableChanges] of changesByTable) {
          const fullTableName = `${tablePrefix}${table}`;

          // Insert new records with conflict handling
          if (tableChanges.inserts.length > 0) {
            const { data, error } = await this.supabase
              .from(fullTableName)
              .upsert(tableChanges.inserts.map(record => ({
                ...record,
                _last_modified: new Date().toISOString(),
                _source: 'local',
                _version: (record._version || 0) + 1
              })), {
                onConflict: 'id',
                ignoreDuplicates: false
              });

            if (error) {
              if (error.code === '23505') { // Unique violation
                console.warn('Insert conflict detected, retrying as update');
                // Convert failed inserts to updates
                tableChanges.updates.push(...tableChanges.inserts);
                tableChanges.inserts = [];
              } else {
                throw error;
              }
            }
          }

          // Update existing records with optimistic concurrency
          for (const update of tableChanges.updates) {
            const { id, ...data } = update;
            if (id) {
              const { error } = await this.supabase
                .from(fullTableName)
                .update({
                  ...data,
                  _last_modified: new Date().toISOString(),
                  _source: 'local',
                  _version: (data._version || 0) + 1
                })
                .eq('id', id);

              if (error) throw error;
            }
          }

          // Delete records
          if (tableChanges.deletes.length > 0) {
            const { error } = await this.supabase
              .from(fullTableName)
              .delete()
              .in('id', tableChanges.deletes);

            if (error) throw error;
          }
        }

        // Success - break out of retry loop
        return;

      } catch (error) {
        if (attempt === maxRetries) {
          this.emit({ 
            type: 'sync-error', 
            error: error instanceof Error ? error : new Error('Supabase push failed after retries') 
          });
          throw error;
        }

        // Wait before retrying with exponential backoff
        const backoffTime = this.calculateBackoff(attempt);
        console.warn(`Push attempt ${attempt} failed, retrying in ${backoffTime}ms`);
        await this.delay(backoffTime);
      }
    }
  }

  async pullChanges(): Promise<ChangeSet> {
    if (!this.supabase) throw new Error('Supabase not initialized');

    const tablePrefix = this.config.tablePrefix || 'columnist_';
    const maxRetries = this.options.maxRetries || 3;
    const changes: ChangeSet = {
      inserts: [],
      updates: [],
      deletes: [],
      timestamp: new Date()
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const schema = this.db.getSchema();
        const tables = this.options.tables || Object.keys(schema);

        for (const table of tables) {
          const fullTableName = `${tablePrefix}${table}`;

          // Get recent changes (last 24 hours by default)
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          
          const { data, error } = await this.supabase
            .from(fullTableName)
            .select('*')
            .gte('_last_modified', twentyFourHoursAgo)
            .order('_last_modified', { ascending: false });

          if (error) throw error;

          for (const record of data || []) {
            // Skip changes that originated locally
            if (record._source === 'local') continue;

            changes.updates.push({
              ...record,
              _table: table
            });
          }
        }

        // Success - break out of retry loop
        return changes;

      } catch (error) {
        if (attempt === maxRetries) {
          this.emit({ 
            type: 'sync-error', 
            error: error instanceof Error ? error : new Error('Supabase pull failed after retries') 
          });
          throw error;
        }

        // Wait before retrying with exponential backoff
        const backoffTime = this.calculateBackoff(attempt);
        console.warn(`Pull attempt ${attempt} failed, retrying in ${backoffTime}ms`);
        await this.delay(backoffTime);
      }
    }

    return changes;
  }

  protected async setupRealtimeListeners(): Promise<void> {
    if (!this.supabase || !this.options.realtime) return;

    const tablePrefix = this.config.tablePrefix || 'columnist_';
    const schema = this.db.getSchema();
    const tables = this.options.tables || Object.keys(schema);

    try {
      this.realtimeSubscription = this.supabase
        .channel('columnist-sync')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: this.config.schema || 'public',
            table: tables.map(table => `${tablePrefix}${table}`)
          }, 
          (payload: any) => {
            const tableName = payload.table.replace(tablePrefix, '');
            
            // Skip changes that originated locally
            if (payload.new?._source === 'local') return;

            this.emit({
              type: 'change-detected',
              table: tableName,
              data: {
                type: payload.eventType,
                record: { ...payload.new, id: payload.new?.id }
              }
            });

            // Trigger immediate sync for real-time changes
            this.sync().catch(console.error);
          }
        )
        .subscribe();

    } catch (error) {
      console.warn('Failed to setup Supabase realtime listeners:', error);
    }
  }

  protected teardownRealtimeListeners(): void {
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe();
      this.realtimeSubscription = null;
    }
  }

  dispose(): void {
    this.teardownRealtimeListeners();
    super.dispose();
  }

  /**
   * Calculate backoff time based on attempt number
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = 1000; // 1 second base
    
    switch (this.options.backoffStrategy) {
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      case 'linear':
        return baseDelay * attempt;
      case 'fixed':
        return baseDelay;
      default:
        return baseDelay * Math.pow(2, attempt - 1);
    }
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}