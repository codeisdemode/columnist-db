import { BaseSyncAdapter, SyncOptions, ChangeSet, SyncEvent } from '../base-adapter';
import { ColumnistDB } from '../../columnist';

export interface RESTfulSyncConfig {
  /** Base URL of the REST API */
  baseURL: string;
  /** API endpoints configuration */
  endpoints?: {
    sync?: string;
    changes?: string;
    conflicts?: string;
  };
  /** Authentication configuration */
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    header?: string;
  };
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional headers */
  headers?: Record<string, string>;
}

export class RESTfulSyncAdapter extends BaseSyncAdapter {
  private config: RESTfulSyncConfig;
  private abortController: AbortController | null = null;

  constructor(db: ColumnistDB, options: RESTfulSyncConfig & SyncOptions) {
    super(db, options);
    this.config = options;
  }

  async initialize(): Promise<void> {
    // Validate configuration
    if (!this.config.baseURL) {
      throw new Error('baseURL is required for RESTful sync adapter');
    }

    // Test connection
    try {
      await this.makeRequest('GET', '/health', null, { timeout: 5000 });
      this.emit({ type: 'sync-start' });
    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('REST API initialization failed') 
      });
      throw error;
    }
  }

  async pushChanges(changes: ChangeSet): Promise<void> {
    try {
      const endpoint = this.config.endpoints?.sync || '/sync/changes';
      await this.makeRequest('POST', endpoint, {
        changes,
        timestamp: new Date().toISOString(),
        source: 'columnist'
      });
    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('REST push failed') 
      });
      throw error;
    }
  }

  async pullChanges(): Promise<ChangeSet> {
    try {
      const endpoint = this.config.endpoints?.changes || '/sync/changes';
      const response = await this.makeRequest('GET', endpoint);
      
      if (response && typeof response === 'object') {
        return this.normalizeChangeSet(response);
      }
      
      return { inserts: [], updates: [], deletes: [], timestamp: new Date() };
    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('REST pull failed') 
      });
      throw error;
    }
  }

  protected async setupRealtimeListeners(): Promise<void> {
    if (!this.options.realtime) return;
    
    // REST adapters typically don't support real-time listening
    // without WebSocket support, which would be a separate adapter
    console.warn('Real-time listening not supported for REST adapter. Use WebSocket adapter for real-time features.');
  }

  protected teardownRealtimeListeners(): void {
    // No real-time listeners to teardown
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    data?: any,
    options: { timeout?: number; headers?: Record<string, string> } = {}
  ): Promise<any> {
    const url = new URL(endpoint, this.config.baseURL).toString();
    const headers = this.buildHeaders(options.headers);
    const timeout = options.timeout || this.config.timeout || 30000;

    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  private buildHeaders(additionalHeaders?: Record<string, string>): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...additionalHeaders,
    };

    // Add authentication headers
    if (this.config.auth) {
      switch (this.config.auth.type) {
        case 'bearer':
          if (this.config.auth.token) {
            headers['Authorization'] = `Bearer ${this.config.auth.token}`;
          }
          break;
        case 'basic':
          if (this.config.auth.username && this.config.auth.password) {
            const credentials = btoa(`${this.config.auth.username}:${this.config.auth.password}`);
            headers['Authorization'] = `Basic ${credentials}`;
          }
          break;
        case 'api-key':
          if (this.config.auth.apiKey) {
            const headerName = this.config.auth.header || 'X-API-Key';
            headers[headerName] = this.config.auth.apiKey;
          }
          break;
      }
    }

    return headers;
  }

  private normalizeChangeSet(data: any): ChangeSet {
    // Normalize the response from various API formats
    const changes: ChangeSet = {
      inserts: Array.isArray(data.inserts) ? data.inserts : [],
      updates: Array.isArray(data.updates) ? data.updates : [],
      deletes: Array.isArray(data.deletes) ? data.deletes : [],
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
    };

    return changes;
  }

  dispose(): void {
    this.teardownRealtimeListeners();
    super.dispose();
  }
}