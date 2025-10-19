// ColumnistDB Adapter for MCP Server
// Provides database operations for MCP tools and resources

import { ColumnistDBAdapter } from './types';
import { Columnist } from '../columnist';

export class ColumnistNodeAdapter implements ColumnistDBAdapter {
  private db: any;
  private isInitialized = false;

  constructor(private databaseName: string) {}

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await Columnist.init(this.databaseName, {
        databaseName: this.databaseName,
        schema: {
          // Default schema for MCP operations
          mcp_sessions: {
            columns: {
              id: 'string',
              client_id: 'string',
              created_at: 'number',
              last_activity: 'number'
            },
            primaryKey: 'id'
          },
          // Memory table for AI memory operations
          memories: {
            columns: {
              id: 'number',
              content: 'string',
              content_type: 'string',
              category: 'string',
              metadata: 'string',
              source: 'string',
              created_at: 'number',
              updated_at: 'number',
              importance: 'number',
              access_count: 'number'
            },
            primaryKey: 'id'
          }
        }
      });

      this.isInitialized = true;
      console.log(`[MCP Adapter] Database '${this.databaseName}' initialized successfully`);
    } catch (error) {
      console.error(`[MCP Adapter] Failed to initialize database:`, error);
      throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSchema(): Promise<any> {
    await this.ensureInitialized();

    try {
      // Return a simplified schema representation
      const schema = {
        tables: {
          mcp_sessions: {
            id: 'string',
            client_id: 'string',
            created_at: 'number',
            last_activity: 'number'
          },
          memories: {
            id: 'number',
            content: 'string',
            content_type: 'string',
            category: 'string',
            metadata: 'string',
            source: 'string',
            created_at: 'number',
            updated_at: 'number',
            importance: 'number',
            access_count: 'number'
          }
        }
      };

      return schema;
    } catch (error) {
      console.error(`[MCP Adapter] Failed to get schema:`, error);
      throw new Error(`Schema retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async query(table: string, options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      if (!this.db[table]) {
        throw new Error(`Table '${table}' not found`);
      }

      const result = await this.db[table].find(options);
      return result || [];
    } catch (error) {
      console.error(`[MCP Adapter] Query failed for table '${table}':`, error);
      throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async search(table: string, query: string, options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      if (!this.db[table]) {
        throw new Error(`Table '${table}' not found`);
      }

      const result = await this.db[table].search(query, options);
      return result || [];
    } catch (error) {
      console.error(`[MCP Adapter] Search failed for table '${table}':`, error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async insert(table: string, records: any[]): Promise<any> {
    await this.ensureInitialized();

    try {
      if (!this.db[table]) {
        throw new Error(`Table '${table}' not found`);
      }

      // Add timestamps if not provided
      const now = Date.now();
      const processedRecords = records.map(record => ({
        ...record,
        created_at: record.created_at || now,
        updated_at: record.updated_at || now
      }));

      const result = await this.db[table].insert(processedRecords);
      return result;
    } catch (error) {
      console.error(`[MCP Adapter] Insert failed for table '${table}':`, error);
      throw new Error(`Insert failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async update(table: string, where: any, updates: any): Promise<any> {
    await this.ensureInitialized();

    try {
      if (!this.db[table]) {
        throw new Error(`Table '${table}' not found`);
      }

      // Add updated_at timestamp
      const processedUpdates = {
        ...updates,
        updated_at: Date.now()
      };

      // Find and update records
      const records = await this.db[table].find({ where });
      if (records.length === 0) {
        return { updated: 0 };
      }

      const updatePromises = records.map(async (record: any) => {
        const updatedRecord = { ...record, ...processedUpdates };
        await this.db[table].update(record.id, updatedRecord);
      });

      await Promise.all(updatePromises);
      return { updated: records.length };
    } catch (error) {
      console.error(`[MCP Adapter] Update failed for table '${table}':`, error);
      throw new Error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async delete(table: string, where: any): Promise<any> {
    await this.ensureInitialized();

    try {
      if (!this.db[table]) {
        throw new Error(`Table '${table}' not found`);
      }

      // Find records to delete
      const records = await this.db[table].find({ where });
      if (records.length === 0) {
        return { deleted: 0 };
      }

      const deletePromises = records.map(async (record: any) => {
        await this.db[table].delete(record.id);
      });

      await Promise.all(deletePromises);
      return { deleted: records.length };
    } catch (error) {
      console.error(`[MCP Adapter] Delete failed for table '${table}':`, error);
      throw new Error(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getDB(): any {
    return this.db;
  }

  isDBInitialized(): boolean {
    return this.isInitialized;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  // Session management for MCP connections
  async createSession(clientId: string): Promise<string> {
    await this.ensureInitialized();

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    await this.db.mcp_sessions.insert({
      id: sessionId,
      client_id: clientId,
      created_at: now,
      last_activity: now
    });

    return sessionId;
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await this.ensureInitialized();

    await this.db.mcp_sessions.update(sessionId, {
      last_activity: Date.now()
    });
  }

  async cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    await this.ensureInitialized();

    const cutoff = Date.now() - maxAgeMs;
    const oldSessions = await this.db.mcp_sessions.find({
      where: { last_activity: { $lt: cutoff } }
    });

    if (oldSessions.length > 0) {
      await this.db.mcp_sessions.deleteMany(oldSessions.map((s: any) => s.id));
    }

    return oldSessions.length;
  }
}