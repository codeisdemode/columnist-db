#!/usr/bin/env node

/**
 * Columnist-DB AI Memory MCP Server
 *
 * Universal AI memory function for storing and retrieving any content type
 * Supports conversations, documents, web content, notes, and custom data
 */

import { ColumnistMCPServer } from 'columnist-db-core';

class AIMemoryMCPServer extends ColumnistMCPServer {
  constructor(config) {
    super(config);
    this.memoryTools = this.createMemoryTools();
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
      },

      // Conversation Memory
      store_conversation: {
        description: "Store conversation with AI",
        parameters: {
          messages: { type: "string", description: "JSON array of conversation messages" },
          summary: { type: "string", description: "Conversation summary", optional: true },
          tags: { type: "string", description: "Comma-separated tags", optional: true }
        }
      },

      search_conversations: {
        description: "Search conversation history",
        parameters: {
          query: { type: "string", description: "Search query" },
          tags: { type: "string", description: "Filter by tags", optional: true }
        }
      },

      // Document Management
      store_document: {
        description: "Store documents with metadata",
        parameters: {
          content: { type: "string", description: "Document content" },
          title: { type: "string", description: "Document title" },
          author: { type: "string", description: "Document author", optional: true },
          document_type: { type: "string", description: "Type (article, report, email, etc.)", optional: true },
          tags: { type: "string", description: "Comma-separated tags", optional: true }
        }
      },

      // Web Content
      store_web_content: {
        description: "Store web pages or online content",
        parameters: {
          content: { type: "string", description: "Web content" },
          url: { type: "string", description: "Source URL" },
          title: { type: "string", description: "Page title", optional: true },
          summary: { type: "string", description: "Content summary", optional: true }
        }
      },

      // Memory Management
      get_memory_stats: {
        description: "Get statistics about stored content",
        parameters: {}
      },

      clear_memory: {
        description: "Clear all or filtered content from memory",
        parameters: {
          content_type: { type: "string", description: "Clear specific content type", optional: true },
          tags: { type: "string", description: "Clear content with specific tags", optional: true }
        }
      },

      export_memory: {
        description: "Export memory content to various formats",
        parameters: {
          format: { type: "string", description: "Export format (json, csv, markdown)", optional: true },
          content_type: { type: "string", description: "Export specific content type", optional: true }
        }
      },

      // Advanced Memory Features
      find_related_content: {
        description: "Find content related to a topic or existing content",
        parameters: {
          topic: { type: "string", description: "Topic or content ID" },
          similarity_threshold: { type: "number", description: "Similarity threshold", optional: true }
        }
      },

      summarize_content: {
        description: "Generate summary of stored content",
        parameters: {
          content_ids: { type: "string", description: "Comma-separated content IDs", optional: true },
          content_type: { type: "string", description: "Summarize specific content type", optional: true }
        }
      }
    };
  }

  setupProtocolHandlers() {
    super.setupProtocolHandlers();

    this.server.setRequestHandler('mcp/discovery', async () => ({
      name: 'ai-memory-mcp-server',
      version: '1.0.0',
      capabilities: {
        resources: { subscribe: false },
        tools: this.memoryTools
      }
    }));

    this.server.setRequestHandler('mcp/tools/call', async (params) => {
      const { name, arguments: args } = params;

      switch (name) {
        case 'store_content':
          return await this.handleStoreContent(args);
        case 'search_memory':
          return await this.handleSearchMemory(args);
        case 'get_content':
          return await this.handleGetContent(args);
        case 'store_conversation':
          return await this.handleStoreConversation(args);
        case 'search_conversations':
          return await this.handleSearchConversations(args);
        case 'store_document':
          return await this.handleStoreDocument(args);
        case 'store_web_content':
          return await this.handleStoreWebContent(args);
        case 'get_memory_stats':
          return await this.handleGetMemoryStats(args);
        case 'clear_memory':
          return await this.handleClearMemory(args);
        case 'export_memory':
          return await this.handleExportMemory(args);
        case 'find_related_content':
          return await this.handleFindRelatedContent(args);
        case 'summarize_content':
          return await this.handleSummarizeContent(args);
        default:
          return await super.handleToolCall(name, args);
      }
    });
  }

  async handleStoreContent(args) {
    const { content, content_type, title, tags, metadata, source } = args;

    const memoryItem = {
      id: this.generateId('content'),
      content,
      contentType: content_type,
      title: title || `Untitled ${content_type}`,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      metadata: metadata ? JSON.parse(metadata) : {},
      source: source || 'mcp',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.adapter.insert('memory', memoryItem);

    return {
      content: [{
        type: 'text',
        text: `Content stored successfully with ID: ${result.ids[0]}`
      }]
    };
  }

  async handleSearchMemory(args) {
    const { query, content_type, tags, limit = 10 } = args;

    let where = {};
    if (content_type) where.contentType = content_type;

    const results = await this.adapter.search('memory', query, {
      where,
      limit
    });

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No content found matching "${query}"`
        }]
      };
    }

    const resultText = results.map((item, index) =>
      `${index + 1}. [${item.contentType}] ${item.title}\n   ID: ${item.id}\n   Score: ${item.score?.toFixed(2) || 'N/A'}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} items:\n\n${resultText}`
      }]
    };
  }

  async handleGetContent(args) {
    const { content_id } = args;

    const items = await this.adapter.query('memory', {
      where: { id: content_id }
    });

    if (items.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Content with ID ${content_id} not found`
        }]
      };
    }

    const item = items[0];
    const details = `
Content: ${item.title}
Type: ${item.contentType}
ID: ${item.id}
Created: ${item.createdAt}
Tags: ${item.tags.join(', ') || 'None'}
Source: ${item.source}

Content Preview:
${item.content.substring(0, 300)}${item.content.length > 300 ? '...' : ''}
    `.trim();

    return {
      content: [{
        type: 'text',
        text: details
      }]
    };
  }

  async handleStoreConversation(args) {
    const { messages, summary, tags } = args;

    const conversation = {
      id: this.generateId('conv'),
      contentType: 'conversation',
      title: summary || 'AI Conversation',
      content: messages,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      metadata: { messageCount: JSON.parse(messages).length },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.adapter.insert('memory', conversation);

    return {
      content: [{
        type: 'text',
        text: `Conversation stored successfully with ID: ${result.ids[0]}`
      }]
    };
  }

  async handleSearchConversations(args) {
    const { query, tags } = args;

    let where = { contentType: 'conversation' };
    if (tags) where.tags = { $contains: tags.split(',').map(tag => tag.trim()) };

    const results = await this.adapter.search('memory', query, { where });

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No conversations found matching "${query}"`
        }]
      };
    }

    const resultText = results.map((conv, index) =>
      `${index + 1}. ${conv.title}\n   Messages: ${conv.metadata?.messageCount || 'Unknown'}\n   ID: ${conv.id}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} conversations:\n\n${resultText}`
      }]
    };
  }

  async handleStoreDocument(args) {
    const { content, title, author, document_type, tags } = args;

    const document = {
      id: this.generateId('doc'),
      contentType: 'document',
      title,
      content,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      metadata: {
        author: author || 'Unknown',
        documentType: document_type || 'general',
        wordCount: content.split(' ').length
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.adapter.insert('memory', document);

    return {
      content: [{
        type: 'text',
        text: `Document "${title}" stored successfully with ID: ${result.ids[0]}`
      }]
    };
  }

  async handleStoreWebContent(args) {
    const { content, url, title, summary } = args;

    const webContent = {
      id: this.generateId('web'),
      contentType: 'web',
      title: title || 'Web Content',
      content: summary ? `${summary}\n\nFull Content:\n${content}` : content,
      tags: ['web', 'online'],
      metadata: {
        url,
        hasSummary: !!summary,
        source: 'web'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.adapter.insert('memory', webContent);

    return {
      content: [{
        type: 'text',
        text: `Web content from ${url} stored successfully with ID: ${result.ids[0]}`
      }]
    };
  }

  async handleGetMemoryStats(args) {
    const allItems = await this.adapter.query('memory', {});

    const stats = {
      totalItems: allItems.length,
      byType: {},
      byTag: {},
      recentActivity: {}
    };

    allItems.forEach(item => {
      // Count by type
      stats.byType[item.contentType] = (stats.byType[item.contentType] || 0) + 1;

      // Count by tag
      item.tags?.forEach(tag => {
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
      });

      // Recent activity (last 7 days)
      const daysAgo = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo <= 7) {
        stats.recentActivity[item.contentType] = (stats.recentActivity[item.contentType] || 0) + 1;
      }
    });

    const statsText = `
AI Memory Statistics:
- Total Items: ${stats.totalItems}
- By Type: ${Object.entries(stats.byType).map(([type, count]) => `${type}: ${count}`).join(', ')}
- Recent Activity (7 days): ${Object.entries(stats.recentActivity).map(([type, count]) => `${type}: ${count}`).join(', ')}
- Top Tags: ${Object.entries(stats.byTag).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => `${tag} (${count})`).join(', ')}
    `.trim();

    return {
      content: [{
        type: 'text',
        text: statsText
      }]
    };
  }

  async handleClearMemory(args) {
    const { content_type, tags } = args;

    let where = {};
    if (content_type) where.contentType = content_type;
    if (tags) where.tags = { $contains: tags.split(',').map(tag => tag.trim()) };

    const itemsToDelete = await this.adapter.query('memory', { where });

    if (itemsToDelete.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No content found matching the specified criteria'
        }]
      };
    }

    await this.adapter.delete('memory', where);

    return {
      content: [{
        type: 'text',
        text: `Cleared ${itemsToDelete.length} items from memory`
      }]
    };
  }

  async handleExportMemory(args) {
    const { format = 'json', content_type } = args;

    let where = {};
    if (content_type) where.contentType = content_type;

    const items = await this.adapter.query('memory', { where });

    let exportData;
    switch (format) {
      case 'json':
        exportData = JSON.stringify(items, null, 2);
        break;
      case 'csv':
        exportData = this.convertToCSV(items);
        break;
      case 'markdown':
        exportData = this.convertToMarkdown(items);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return {
      content: [{
        type: 'text',
        text: `Memory exported in ${format.toUpperCase()} format (${items.length} items):\n\n${exportData}`
      }]
    };
  }

  async handleFindRelatedContent(args) {
    const { topic, similarity_threshold = 0.7 } = args;

    // Use semantic search to find related content
    const results = await this.adapter.search('memory', topic, {
      limit: 5,
      similarityThreshold: similarity_threshold
    });

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No related content found for "${topic}"`
        }]
      };
    }

    const resultText = results.map((item, index) =>
      `${index + 1}. [${item.contentType}] ${item.title}\n   Similarity: ${(item.score * 100).toFixed(1)}%\n   ID: ${item.id}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} related items:\n\n${resultText}`
      }]
    };
  }

  async handleSummarizeContent(args) {
    const { content_ids, content_type } = args;

    let items;
    if (content_ids) {
      const ids = content_ids.split(',').map(id => id.trim());
      items = await this.adapter.query('memory', {
        where: { id: { $in: ids } }
      });
    } else if (content_type) {
      items = await this.adapter.query('memory', {
        where: { contentType: content_type }
      });
    } else {
      items = await this.adapter.query('memory', {});
    }

    if (items.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No content found to summarize'
        }]
      };
    }

    const summary = `
Content Summary (${items.length} items):
- Total Items: ${items.length}
- Content Types: ${[...new Set(items.map(item => item.contentType))].join(', ')}
- Date Range: ${new Date(Math.min(...items.map(item => new Date(item.createdAt).getTime()))).toLocaleDateString()} to ${new Date(Math.max(...items.map(item => new Date(item.createdAt).getTime()))).toLocaleDateString()}
- Sample Titles: ${items.slice(0, 3).map(item => item.title).join(', ')}${items.length > 3 ? '...' : ''}
    `.trim();

    return {
      content: [{
        type: 'text',
        text: summary
      }]
    };
  }

  // Helper methods
  generateId(prefix = 'mem') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  convertToCSV(items) {
    const headers = ['ID', 'Type', 'Title', 'Tags', 'Created', 'Word Count'];
    const rows = items.map(item => [
      item.id,
      item.contentType,
      `"${item.title.replace(/"/g, '""')}"`,
      item.tags.join(';'),
      item.createdAt,
      item.content.split(' ').length
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  convertToMarkdown(items) {
    return items.map(item => `# ${item.title}\n\n**Type:** ${item.contentType}\n**ID:** ${item.id}\n**Created:** ${item.createdAt}\n\n${item.content.substring(0, 200)}...`).join('\n\n---\n\n');
  }
}

// CLI interface
if (require.main === module) {
  const config = {
    databaseName: process.env.DB_NAME || 'ai-memory',
    authToken: process.env.AUTH_TOKEN
  };

  const server = new AIMemoryMCPServer(config);

  server.start().catch(error => {
    console.error('Failed to start AI Memory MCP server:', error);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down AI Memory MCP server...');
    await server.stop();
    process.exit(0);
  });
}

export { AIMemoryMCPServer };