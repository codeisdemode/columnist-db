#!/usr/bin/env node

/**
 * Simple Columnist-DB AI Memory MCP Server
 *
 * Universal AI memory function for storing and retrieving any content type
 * Supports conversations, documents, web content, notes, and custom data
 */

import { Columnist } from 'columnist-db-core';

class SimpleAIMemoryMCPServer {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.tools = this.createMemoryTools();
  }

  async initialize() {
    // Initialize the database
    this.db = await Columnist.init('ai-memory', {
      schema: {
        memory: {
          id: { type: 'string', primaryKey: true },
          content: { type: 'string' },
          content_type: { type: 'string' },
          title: { type: 'string', optional: true },
          tags: { type: 'string', optional: true },
          metadata: { type: 'string', optional: true },
          source: { type: 'string', optional: true },
          created_at: { type: 'number' },
          updated_at: { type: 'number' }
        }
      }
    });

    console.log('AI Memory MCP Server initialized');
  }

  createMemoryTools() {
    return {
      // Universal Content Storage
      store_content: {
        description: "Store any type of content in AI memory",
        parameters: {
          content: { type: "string", description: "Content to store" },
          content_type: {
            type: "string",
            description: "Type of content (conversation, document, web, note, custom)",
            enum: ["conversation", "document", "web", "note", "custom"]
          },
          title: { type: "string", description: "Content title", optional: true },
          tags: { type: "string", description: "Comma-separated tags", optional: true },
          metadata: { type: "string", description: "JSON metadata", optional: true },
          source: { type: "string", description: "Content source", optional: true }
        }
      },

      search_memory: {
        description: "Search across all stored content",
        parameters: {
          query: { type: "string", description: "Search query" },
          content_type: { type: "string", description: "Filter by content type", optional: true },
          tags: { type: "string", description: "Filter by tags", optional: true },
          limit: { type: "number", description: "Maximum results", optional: true }
        }
      },

      get_content: {
        description: "Retrieve specific content by ID",
        parameters: {
          content_id: { type: "string", description: "Content ID" }
        }
      }
    };
  }

  async handleToolCall(toolName, parameters) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    switch (toolName) {
      case 'store_content':
        return await this.storeContent(parameters);
      case 'search_memory':
        return await this.searchMemory(parameters);
      case 'get_content':
        return await this.getContent(parameters);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async storeContent({ content, content_type, title, tags, metadata, source }) {
    const id = `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const record = {
      id,
      content,
      content_type,
      title: title || `Untitled ${content_type}`,
      tags: tags || '',
      metadata: metadata || '{}',
      source: source || 'mcp-server',
      created_at: now,
      updated_at: now
    };

    await this.db.memory.insert(record);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          content_id: id,
          message: 'Content stored successfully'
        }, null, 2)
      }]
    };
  }

  async searchMemory({ query, content_type, tags, limit = 10 }) {
    let where = {};

    if (content_type) {
      where.content_type = content_type;
    }

    if (tags) {
      where.tags = { $contains: tags };
    }

    // Simple text search (in a real implementation, you'd use vector search)
    const results = await this.db.memory.find({
      where,
      orderBy: 'created_at',
      limit
    });

    // Filter by query if provided
    const filteredResults = query
      ? results.filter(record =>
          record.content.toLowerCase().includes(query.toLowerCase()) ||
          record.title.toLowerCase().includes(query.toLowerCase())
        )
      : results;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          results: filteredResults,
          count: filteredResults.length
        }, null, 2)
      }]
    };
  }

  async getContent({ content_id }) {
    const content = await this.db.memory.findOne({
      where: { id: content_id }
    });

    if (!content) {
      throw new Error(`Content with ID ${content_id} not found`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(content, null, 2)
      }]
    };
  }

  // Simple MCP protocol implementation
  async handleMCPRequest(request) {
    if (request.method === 'tools/call') {
      const { name, arguments: params } = request.params;

      try {
        const result = await this.handleToolCall(name, params);
        return {
          result,
          status: 'success'
        };
      } catch (error) {
        return {
          error: {
            code: -32603,
            message: error.message
          },
          status: 'error'
        };
      }
    }

    // Handle other MCP protocol methods
    return {
      error: {
        code: -32601,
        message: 'Method not found'
      },
      status: 'error'
    };
  }

  // Start the server (simple stdin/stdout implementation)
  async start() {
    await this.initialize();

    console.log('Simple AI Memory MCP Server started');
    console.log('Available tools:', Object.keys(this.tools).join(', '));

    // Simple stdin/stdout MCP protocol
    process.stdin.on('data', async (data) => {
      try {
        const request = JSON.parse(data.toString());
        const response = await this.handleMCPRequest(request);
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        process.stdout.write(JSON.stringify({
          error: {
            code: -32700,
            message: 'Parse error'
          },
          status: 'error'
        }) + '\n');
      }
    });

    process.stdin.resume();
  }
}

// Start the server if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SimpleAIMemoryMCPServer({});
  server.start().catch(console.error);
}

export { SimpleAIMemoryMCPServer };