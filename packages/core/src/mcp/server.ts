import { ColumnistNodeAdapter } from './adapter';
import { AuthManager } from './auth';
import { SecurityManager } from './security';
import { MCPConfig, MCPResource, MCPTool } from './types';
import { MCPServer } from './sdk-minimal';
import { MemoryMCPTools } from '../memory/mcp-tools';

export class ColumnistMCPServer {
  private server: MCPServer;
  private adapter: ColumnistNodeAdapter;
  private authManager: AuthManager;
  private securityManager: SecurityManager;
  private memoryTools?: MemoryMCPTools;
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
    this.adapter = new ColumnistNodeAdapter(config.databaseName);
    this.authManager = new AuthManager({
      secret: config.authToken,
      requireAuth: !!config.authToken
    });
    this.securityManager = new SecurityManager();
    
    // Initialize MCP server with proper implementation
    this.server = new MCPServer({
      name: 'columnist-mcp-server',
      version: '1.2.0'
    });
    
    this.setupProtocolHandlers();
  }

  private setupProtocolHandlers() {
    // Setup core database tools
    this.setupDatabaseTools();
    
    // Setup resources
    this.setupDatabaseResources();
  }

  private setupDatabaseTools() {
    // Query tool
    this.server.tool(
      'columnist_query',
      {
        database: { type: 'string', description: 'Database name' },
        table: { type: 'string', description: 'Table name' },
        where: { type: 'object', description: 'Query conditions', optional: true },
        orderBy: { type: 'string', description: 'Sort field', optional: true },
        limit: { type: 'number', description: 'Max results', optional: true },
        offset: { type: 'number', description: 'Results offset', optional: true }
      },
      async ({ database, table, where, orderBy, limit, offset }: any) => {
        return await this.handleQuery({ database, table, where, orderBy, limit, offset });
      }
    );

    // Search tool
    this.server.tool(
      'columnist_search',
      {
        database: { type: 'string', description: 'Database name' },
        table: { type: 'string', description: 'Table name' },
        query: { type: 'string', description: 'Search query' },
        filters: { type: 'object', description: 'Additional filters', optional: true },
        limit: { type: 'number', description: 'Max results', optional: true }
      },
      async ({ database, table, query, filters, limit }: any) => {
        return await this.handleSearch({ database, table, query, filters, limit });
      }
    );

    // Insert tool
    this.server.tool(
      'columnist_insert',
      {
        database: { type: 'string', description: 'Database name' },
        table: { type: 'string', description: 'Table name' },
        records: { type: 'array', description: 'Records to insert' }
      },
      async ({ database, table, records }: any) => {
        return await this.handleInsert({ database, table, records });
      }
    );
  }

  private setupDatabaseResources() {
    this.server.resource(
      `mcp://columnist/${this.config.databaseName}/schema/`,
      'Database Schema',
      'Complete database schema definition',
      'application/json',
      async () => {
        const schema = await this.adapter.getSchema();
        return JSON.stringify(schema, null, 2);
      }
    );

    // Dynamic table resources will be added in start()
  }

  private async handleQuery(args: any, clientId: string = 'anonymous') {
    const { database, table, where, orderBy, limit, offset } = args;
    
    if (database !== this.config.databaseName) {
      throw new Error(`Database ${database} not found`);
    }

    // Security checks
    if (!this.securityManager.isTableAllowed(table)) {
      throw new Error(`Access to table ${table} is not allowed`);
    }

    const queryValidation = this.securityManager.validateQuery(where);
    if (!queryValidation.valid) {
      throw new Error(queryValidation.error);
    }

    if (!this.securityManager.checkConnection(clientId)) {
      throw new Error('Too many concurrent connections');
    }

    try {
      const records = await this.adapter.query(table, { where, orderBy, limit, offset });
      const sanitizedRecords = this.securityManager.sanitizeOutput(records);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(sanitizedRecords, null, 2)
        }]
      };
    } finally {
      this.securityManager.releaseConnection(clientId);
    }
  }

  private async handleSearch(args: any, clientId: string = 'anonymous') {
    const { database, table, query, filters, limit } = args;
    
    if (database !== this.config.databaseName) {
      throw new Error(`Database ${database} not found`);
    }

    if (!this.securityManager.isTableAllowed(table)) {
      throw new Error(`Access to table ${table} is not allowed`);
    }

    if (!this.securityManager.checkConnection(clientId)) {
      throw new Error('Too many concurrent connections');
    }

    try {
      const results = await this.adapter.search(table, query, { filters, limit });
      const sanitizedResults = this.securityManager.sanitizeOutput(results);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(sanitizedResults, null, 2)
        }]
      };
    } finally {
      this.securityManager.releaseConnection(clientId);
    }
  }

  private async handleInsert(args: any, clientId: string = 'anonymous') {
    const { database, table, records } = args;
    
    if (database !== this.config.databaseName) {
      throw new Error(`Database ${database} not found`);
    }

    if (!this.securityManager.isTableAllowed(table)) {
      throw new Error(`Access to table ${table} is not allowed`);
    }

    if (!this.securityManager.isOperationAllowed('insert')) {
      throw new Error('Insert operations are not allowed');
    }

    if (!this.securityManager.checkConnection(clientId)) {
      throw new Error('Too many concurrent connections');
    }

    try {
      const result = await this.adapter.insert(table, records);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, insertedIds: result.ids })
        }]
      };
    } finally {
      this.securityManager.releaseConnection(clientId);
    }
  }

  async start(): Promise<void> {
    await this.adapter.init();
    
    // Initialize memory tools with the database adapter
    const db = this.adapter.getDB();
    this.memoryTools = new MemoryMCPTools(db, this.server);
    await this.memoryTools.initialize();
    
    // Add dynamic table resources
    const schema = await this.adapter.getSchema();
    Object.keys(schema).forEach(tableName => {
      this.server.resource(
        `mcp://columnist/${this.config.databaseName}/${tableName}/`,
        `${tableName} Table`,
        `All records in the ${tableName} table`,
        'application/json',
        async () => {
          const records = await this.adapter.query(tableName, {});
          return JSON.stringify(records, null, 2);
        }
      );
    });
    
    await this.server.start();
    console.log(`Columnist MCP Server started for database: ${this.config.databaseName}`);
    console.log(`Memory AI features enabled with ${Object.keys(schema).length} tables`);
    console.log(`Available tools: ${this.server.getTools().join(', ')}`);
    console.log(`Available resources: ${this.server.getResources().join(', ')}`);
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  // Expose server for testing
  getServer(): MCPServer {
    return this.server;
  }
}