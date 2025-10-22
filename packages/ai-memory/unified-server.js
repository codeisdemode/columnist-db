#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Columnist, BasicEmbeddingProvider } from 'columnist-db-core';

const DEFAULT_DB_NAME = process.env.DB_NAME || 'ai-memory';

class UnifiedAIMemoryMCPServer {
  constructor(config = {}) {
    this.config = {
      databaseName: DEFAULT_DB_NAME,
      ...config,
    };

    this.embeddingProvider = new BasicEmbeddingProvider();
    this.dbReady = this.initializeDatabase();

    this.server = new Server(
      {
        name: 'ai-memory-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async initializeDatabase() {
    const db = await Columnist.init(this.config.databaseName, {
      autoInitialize: false,
      schema: {
        content: {
          columns: {
            id: 'number',
            contentType: 'string',
            title: 'string',
            body: 'string',
            tagString: 'string',
            tags: 'json',
            metadata: 'json',
            source: 'string',
            createdAt: 'date',
            updatedAt: 'date',
          },
          primaryKey: 'id',
          searchableFields: ['title', 'body', 'tagString', 'contentType'],
          secondaryIndexes: ['contentType', 'createdAt'],
          vector: {
            field: 'body',
            dims: this.embeddingProvider.getDimensions(),
          },
        },
      },
    });

    db.registerEmbedder('content', text => this.embeddingProvider.generateEmbedding(text));
    return db;
  }

  async getDb() {
    return this.dbReady;
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.listTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args = {} } = request.params;

      switch (name) {
        case 'store_content':
          return this.handleStoreContent(args);
        case 'search_memory':
          return this.handleSearchMemory(args);
        case 'get_content':
          return this.handleGetContent(args);
        case 'store_conversation':
          return this.handleStoreConversation(args);
        case 'search_conversations':
          return this.handleSearchConversations(args);
        case 'store_document':
          return this.handleStoreDocument(args);
        case 'store_web_content':
          return this.handleStoreWebContent(args);
        case 'store_research_paper':
          return this.handleStoreResearchPaper(args);
        case 'get_memory_stats':
          return this.handleGetMemoryStats();
        case 'clear_memory':
          return this.handleClearMemory(args);
        case 'export_memory':
          return this.handleExportMemory(args);
        case 'find_related_content':
          return this.handleFindRelatedContent(args);
        case 'summarize_content':
          return this.handleSummarizeContent(args);
        case 'contextual_memory_search':
          return this.handleContextualMemorySearch(args);
        case 'consolidate_memories':
          return this.handleConsolidateMemories();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  listTools() {
    return [
      {
        name: 'store_content',
        description: 'Store arbitrary content in the AI memory database',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Content to store' },
            content_type: {
              type: 'string',
              description: 'Content type (conversation, document, web, note, custom, research)',
              enum: ['conversation', 'document', 'web', 'note', 'custom', 'research'],
            },
            title: { type: 'string', description: 'Content title', optional: true },
            tags: { type: 'string', description: 'Comma-separated tags', optional: true },
            metadata: { type: 'string', description: 'JSON metadata', optional: true },
            source: { type: 'string', description: 'Content source', optional: true },
          },
          required: ['content', 'content_type'],
        },
      },
      {
        name: 'search_memory',
        description: 'Search across stored content',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            content_type: { type: 'string', description: 'Filter by content type', optional: true },
            tags: { type: 'string', description: 'Filter by tags', optional: true },
            limit: { type: 'number', description: 'Maximum results', optional: true },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_content',
        description: 'Retrieve a stored memory by id',
        inputSchema: {
          type: 'object',
          properties: {
            content_id: { type: 'string', description: 'Content id' },
          },
          required: ['content_id'],
        },
      },
      {
        name: 'store_conversation',
        description: 'Store a conversation transcript with optional summary',
        inputSchema: {
          type: 'object',
          properties: {
            messages: { type: 'string', description: 'JSON array of conversation messages' },
            summary: { type: 'string', description: 'Conversation summary', optional: true },
            tags: { type: 'string', description: 'Comma-separated tags', optional: true },
          },
          required: ['messages'],
        },
      },
      {
        name: 'search_conversations',
        description: 'Search stored conversations',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            tags: { type: 'string', description: 'Filter by tags', optional: true },
          },
          required: ['query'],
        },
      },
      {
        name: 'store_document',
        description: 'Store a document with metadata',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Document content' },
            title: { type: 'string', description: 'Document title' },
            author: { type: 'string', description: 'Document author', optional: true },
            document_type: { type: 'string', description: 'Document type', optional: true },
            tags: { type: 'string', description: 'Comma-separated tags', optional: true },
          },
          required: ['content', 'title'],
        },
      },
      {
        name: 'store_web_content',
        description: 'Store web content or articles',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Full content' },
            url: { type: 'string', description: 'Source URL' },
            title: { type: 'string', description: 'Title', optional: true },
            summary: { type: 'string', description: 'Optional summary', optional: true },
          },
          required: ['content', 'url'],
        },
      },
      {
        name: 'store_research_paper',
        description: 'Store a research paper with academic metadata',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Paper title' },
            authors: { type: 'string', description: 'Comma-separated authors' },
            abstract: { type: 'string', description: 'Paper abstract' },
            publication_date: { type: 'string', description: 'Publication date (YYYY-MM-DD)' },
            tags: { type: 'string', description: 'Comma-separated tags', optional: true },
            url: { type: 'string', description: 'Paper URL', optional: true },
            journal: { type: 'string', description: 'Journal or conference', optional: true },
          },
          required: ['title', 'authors', 'abstract', 'publication_date'],
        },
      },
      {
        name: 'get_memory_stats',
        description: 'Return live statistics about stored content',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'clear_memory',
        description: 'Clear all or filtered content from memory',
        inputSchema: {
          type: 'object',
          properties: {
            content_type: { type: 'string', description: 'Restrict deletion to a specific content type', optional: true },
            tags: { type: 'string', description: 'Delete content with specific tags', optional: true },
          },
        },
      },
      {
        name: 'export_memory',
        description: 'Export stored content in JSON, CSV, or Markdown format',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              description: 'Export format (json, csv, markdown)',
              optional: true,
              enum: ['json', 'csv', 'markdown'],
            },
            content_type: { type: 'string', description: 'Filter by content type', optional: true },
          },
        },
      },
      {
        name: 'find_related_content',
        description: 'Find content related to a topic using vector similarity',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic or snippet to search for' },
            similarity_threshold: { type: 'number', description: 'Cosine similarity threshold (0-1)', optional: true },
          },
          required: ['topic'],
        },
      },
      {
        name: 'summarize_content',
        description: 'Generate a statistical summary of stored content',
        inputSchema: {
          type: 'object',
          properties: {
            content_ids: { type: 'string', description: 'Comma-separated ids to summarise', optional: true },
            content_type: { type: 'string', description: 'Limit summary to a content type', optional: true },
          },
        },
      },
      {
        name: 'contextual_memory_search',
        description: 'Search with user preference and time context',
        inputSchema: {
          type: 'object',
          properties: {
            current_topic: { type: 'string', description: 'Conversation topic or query' },
            user_preferences: { type: 'string', description: 'JSON payload describing user preferences', optional: true },
            time_context: { type: 'string', description: 'JSON payload with temporal constraints', optional: true },
          },
          required: ['current_topic'],
        },
      },
      {
        name: 'consolidate_memories',
        description: 'Deduplicate memories with matching titles per content type',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async handleStoreContent(args) {
    const { content, content_type, title, tags, metadata, source } = args;

    const tagList = this.parseTags(tags);
    const metadataObject = this.parseMetadata(metadata);

    const { id } = await this.insertContent({
      contentType: content_type,
      title: title || `Untitled ${content_type}`,
      body: content,
      tags: tagList,
      metadata: metadataObject,
      source: source || 'mcp',
    });

    return {
      content: [
        {
          type: 'text',
          text: `Content stored successfully with id ${id}.`,
        },
      ],
    };
  }

  async handleSearchMemory(args) {
    const { query, content_type, tags, limit = 10 } = args;
    const requiredTags = this.parseTags(tags);

    const results = await this.searchContent(query, {
      limit,
      contentType: content_type,
      requiredTags,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No memories matched "${query}".`,
          },
        ],
      };
    }

    const formatted = results
      .map((result, index) => {
        const tagsText = result.record.tags?.join(', ') || '—';
        const snippet = result.record.body.replace(/\s+/g, ' ').slice(0, 160);
        return `${index + 1}. [${result.record.contentType}] ${result.record.title}\n   Score: ${result.score.toFixed(3)}\n   Tags: ${tagsText}\n   Snippet: ${snippet}${snippet.length === 160 ? '…' : ''}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: formatted,
        },
      ],
    };
  }

  async handleGetContent(args) {
    const db = await this.getDb();
    const id = Number(args.content_id);
    if (!Number.isFinite(id)) {
      throw new Error('content_id must be a numeric value');
    }

    const results = await db.find({ table: 'content', where: { id } });
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No content found with id ${id}.`,
          },
        ],
      };
    }

    const record = results[0];
    const payload = {
      id: record.id,
      contentType: record.contentType,
      title: record.title,
      tags: record.tags,
      source: record.source,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      metadata: record.metadata,
      body: record.body,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }

  async handleStoreConversation(args) {
    const { messages, summary, tags } = args;
    const parsedMessages = this.safeJson(messages, []);
    if (!Array.isArray(parsedMessages)) {
      throw new Error('messages must be a JSON array');
    }

    const transcript = parsedMessages
      .map(entry => {
        if (typeof entry !== 'object' || !entry) return '';
        const role = entry.role || 'user';
        const content = entry.content || '';
        return `${role}: ${content}`;
      })
      .filter(Boolean)
      .join('\n');

    const metadata = {
      summary: summary || null,
      messageCount: parsedMessages.length,
      rawMessages: parsedMessages,
    };

    const { id } = await this.insertContent({
      contentType: 'conversation',
      title: summary || `Conversation (${new Date().toLocaleString()})`,
      body: transcript,
      tags: this.parseTags(tags),
      metadata,
      source: 'conversation',
    });

    return {
      content: [
        {
          type: 'text',
          text: `Conversation stored with id ${id}.`,
        },
      ],
    };
  }

  async handleSearchConversations(args) {
    const { query, tags, limit = 10 } = args;
    const results = await this.searchContent(query, {
      limit,
      contentType: 'conversation',
      requiredTags: this.parseTags(tags),
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No conversations matched "${query}".`,
          },
        ],
      };
    }

    const output = results
      .map((result, index) => {
        const summary = result.record.metadata?.summary || result.record.title;
        const messageCount = result.record.metadata?.messageCount ?? 'unknown';
        return `${index + 1}. ${summary}\n   Messages: ${messageCount}\n   Score: ${result.score.toFixed(3)}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async handleStoreDocument(args) {
    const { content, title, author, document_type, tags } = args;

    const metadata = {
      author: author || null,
      documentType: document_type || 'general',
      wordCount: content.split(/\s+/).filter(Boolean).length,
    };

    const { id } = await this.insertContent({
      contentType: 'document',
      title,
      body: content,
      tags: this.parseTags(tags),
      metadata,
      source: 'document',
    });

    return {
      content: [
        {
          type: 'text',
          text: `Document "${title}" stored with id ${id}.`,
        },
      ],
    };
  }

  async handleStoreWebContent(args) {
    const { content, url, title, summary } = args;
    const body = summary ? `${summary}\n\nFull content:\n${content}` : content;

    const metadata = {
      url,
      hasSummary: Boolean(summary),
    };

    const { id } = await this.insertContent({
      contentType: 'web',
      title: title || url,
      body,
      tags: ['web'],
      metadata,
      source: url,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Web content from ${url} stored with id ${id}.`,
        },
      ],
    };
  }

  async handleStoreResearchPaper(args) {
    const {
      title,
      authors,
      abstract,
      publication_date,
      tags,
      url,
      journal,
    } = args;

    const metadata = {
      authors,
      publicationDate: publication_date,
      url: url || null,
      journal: journal || null,
    };

    const { id } = await this.insertContent({
      contentType: 'research',
      title,
      body: abstract,
      tags: this.parseTags(tags),
      metadata,
      source: url || 'research',
    });

    return {
      content: [
        {
          type: 'text',
          text: `Research paper "${title}" stored with id ${id}.`,
        },
      ],
    };
  }

  async handleGetMemoryStats() {
    const db = await this.getDb();
    const records = await db.getAll('content', Number.MAX_SAFE_INTEGER);

    if (records.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No content has been stored yet.',
          },
        ],
      };
    }

    const countsByType = new Map();
    const tagFrequency = new Map();
    let earliest = new Date();
    let latest = new Date(0);

    for (const record of records) {
      countsByType.set(record.contentType, (countsByType.get(record.contentType) || 0) + 1);
      const tags = (record.tags || []).map(tag => tag.toString());
      for (const tag of tags) {
        if (!tag) continue;
        tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
      }
      const createdAt = new Date(record.createdAt);
      if (createdAt < earliest) earliest = createdAt;
      if (createdAt > latest) latest = createdAt;
    }

    const typeLines = Array.from(countsByType.entries())
      .map(([type, count]) => `  - ${type}: ${count}`)
      .join('\n');

    const topTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => `${tag} (${count})`)
      .join(', ');

    const stats = [
      `Total items: ${records.length}`,
      'Breakdown by content type:',
      typeLines || '  - (none)',
      `Top tags: ${topTags || '—'}`,
      `Range: ${earliest.toISOString().split('T')[0]} → ${latest.toISOString().split('T')[0]}`,
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: stats,
        },
      ],
    };
  }

  async handleClearMemory(args) {
    const db = await this.getDb();
    const { content_type, tags } = args;
    const tagFilters = this.parseTags(tags);

    const records = await db.getAll('content', Number.MAX_SAFE_INTEGER);
    const idsToDelete = records
      .filter(record => {
        if (content_type && record.contentType !== content_type) return false;
        if (tagFilters.length > 0) {
          const recordTags = (record.tags || []).map(tag => tag.toString());
          return tagFilters.every(tag => recordTags.includes(tag));
        }
        return true;
      })
      .map(record => record.id);

    if (idsToDelete.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No matching memories found to clear.',
          },
        ],
      };
    }

    await db.bulkDelete(idsToDelete, 'content');

    return {
      content: [
        {
          type: 'text',
          text: `Cleared ${idsToDelete.length} memories${content_type ? ` of type ${content_type}` : ''}.`,
        },
      ],
    };
  }

  async handleExportMemory(args) {
    const db = await this.getDb();
    const { format = 'json', content_type } = args;

    const records = await db.getAll('content', Number.MAX_SAFE_INTEGER);
    const filtered = content_type
      ? records.filter(record => record.contentType === content_type)
      : records;

    if (filtered.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No content available for export with the provided filters.',
          },
        ],
      };
    }

    switch (format) {
      case 'json':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(filtered, null, 2),
            },
          ],
        };
      case 'csv':
        return {
          content: [
            {
              type: 'text',
              text: this.toCsv(filtered),
            },
          ],
        };
      case 'markdown':
        return {
          content: [
            {
              type: 'text',
              text: this.toMarkdown(filtered),
            },
          ],
        };
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async handleFindRelatedContent(args) {
    const db = await this.getDb();
    const { topic, similarity_threshold = 0.5 } = args;

    const matches = await db.vectorSearchText('content', topic, {
      limit: 10,
    });

    const filtered = matches.filter(match => match.score >= similarity_threshold);

    if (filtered.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No related memories exceeded the similarity threshold of ${similarity_threshold}.`,
          },
        ],
      };
    }

    const output = filtered
      .map((match, index) => {
        const snippet = match.body.replace(/\s+/g, ' ').slice(0, 140);
        return `${index + 1}. [${match.contentType}] ${match.title}\n   Score: ${match.score.toFixed(3)}\n   Snippet: ${snippet}${snippet.length === 140 ? '…' : ''}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async handleSummarizeContent(args) {
    const db = await this.getDb();
    const { content_ids, content_type } = args;

    let records = await db.getAll('content', Number.MAX_SAFE_INTEGER);
    if (content_type) {
      records = records.filter(record => record.contentType === content_type);
    }

    if (content_ids) {
      const idSet = new Set(
        content_ids
          .split(',')
          .map(id => Number(id.trim()))
          .filter(Number.isFinite)
      );
      records = records.filter(record => idSet.has(record.id));
    }

    if (records.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No content matched the provided filters for summarisation.',
          },
        ],
      };
    }

    const countsByType = new Map();
    const tagFrequency = new Map();

    for (const record of records) {
      countsByType.set(record.contentType, (countsByType.get(record.contentType) || 0) + 1);
      const tags = (record.tags || []).map(tag => tag.toString());
      for (const tag of tags) {
        if (!tag) continue;
        tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
      }
    }

    const topTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => `${tag} (${count})`)
      .join(', ');

    const typeSummary = Array.from(countsByType.entries())
      .map(([type, count]) => `- ${type}: ${count}`)
      .join('\n');

    const highlighted = records
      .slice(0, 5)
      .map(record => `• ${record.title} [${record.contentType}]`)
      .join('\n');

    const summary = [`Total records: ${records.length}`, 'By type:', typeSummary || '- (none)', `Top tags: ${topTags || '—'}`, 'Sample titles:', highlighted].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: summary,
        },
      ],
    };
  }

  async handleContextualMemorySearch(args) {
    const { current_topic, user_preferences, time_context, limit = 5 } = args;

    const preferences = this.safeJson(user_preferences, {});
    const preferredTags = Array.isArray(preferences?.preferredTags)
      ? preferences.preferredTags.map(tag => tag.toString())
      : [];

    const time = this.safeJson(time_context, {});
    const dateRange = {
      start: time?.after ? new Date(time.after) : undefined,
      end: time?.before ? new Date(time.before) : undefined,
    };

    const results = await this.searchContent(current_topic, {
      limit,
      requiredTags: preferredTags,
      dateRange,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No contextual memories matched the provided topic and constraints.',
          },
        ],
      };
    }

    const formatted = results
      .map((result, index) => {
        const created = new Date(result.record.createdAt).toISOString().split('T')[0];
        const tags = result.record.tags?.join(', ') || '—';
        return `${index + 1}. ${result.record.title}\n   Type: ${result.record.contentType}\n   Created: ${created}\n   Tags: ${tags}\n   Score: ${result.score.toFixed(3)}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: formatted,
        },
      ],
    };
  }

  async handleConsolidateMemories() {
    const db = await this.getDb();
    const records = await db.getAll('content', Number.MAX_SAFE_INTEGER);

    const grouped = new Map();
    for (const record of records) {
      const key = `${record.contentType}:${(record.title || '').trim().toLowerCase()}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    }

    const duplicates = [];
    for (const entries of grouped.values()) {
      if (entries.length <= 1) continue;
      // Keep the most recent entry
      entries.sort((a, b) => new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf());
      duplicates.push(...entries.slice(1));
    }

    if (duplicates.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No duplicate memories detected.',
          },
        ],
      };
    }

    await db.bulkDelete(duplicates.map(record => record.id), 'content');

    return {
      content: [
        {
          type: 'text',
          text: `Consolidated ${duplicates.length} duplicate memories across ${grouped.size} title clusters.`,
        },
      ],
    };
  }

  async insertContent({ contentType, title, body, tags, metadata, source }) {
    const db = await this.getDb();
    const now = new Date();

    const record = {
      contentType,
      title,
      body,
      tagString: (tags || []).join(', '),
      tags: tags || [],
      metadata: metadata || {},
      source: source || 'mcp',
      createdAt: now,
      updatedAt: now,
    };

    const { id } = await db.insert(record, 'content');
    return { id, record };
  }

  async searchContent(query, options = {}) {
    const db = await this.getDb();
    const {
      limit = 10,
      contentType,
      requiredTags = [],
      dateRange,
    } = options;

    const aggregated = new Map();

    const applyFilters = record => {
      if (contentType && record.contentType !== contentType) return false;
      if (requiredTags.length > 0) {
        const tags = (record.tags || []).map(tag => tag.toString());
        if (!requiredTags.every(tag => tags.includes(tag))) return false;
      }
      if (dateRange?.start || dateRange?.end) {
        const createdAt = new Date(record.createdAt);
        if (dateRange.start && createdAt < dateRange.start) return false;
        if (dateRange.end && createdAt > dateRange.end) return false;
      }
      return true;
    };

    const textResults = await db.search(query, {
      table: 'content',
      limit: limit * 3,
    });

    for (const result of textResults) {
      if (!applyFilters(result)) continue;
      const existing = aggregated.get(result.id) || {
        record: result,
        textScore: 0,
        vectorScore: 0,
      };
      existing.record = result;
      existing.textScore = Math.max(existing.textScore, result.score);
      aggregated.set(result.id, existing);
    }

    const vectorResults = await db.vectorSearchText('content', query, {
      limit: limit * 3,
    });

    for (const result of vectorResults) {
      if (!applyFilters(result)) continue;
      const existing = aggregated.get(result.id) || {
        record: result,
        textScore: 0,
        vectorScore: 0,
      };
      existing.record = existing.record || result;
      existing.vectorScore = Math.max(existing.vectorScore, result.score);
      aggregated.set(result.id, existing);
    }

    const combined = Array.from(aggregated.values())
      .map(entry => {
        const score = entry.vectorScore * 0.6 + Math.log1p(entry.textScore) * 0.4;
        return { record: entry.record, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return combined;
  }

  parseTags(input) {
    if (!input) return [];
    return input
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  parseMetadata(input) {
    if (!input) return {};
    const parsed = this.safeJson(input, {});
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  }

  safeJson(value, fallback) {
    if (!value || typeof value !== 'string') return fallback;
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Failed to parse JSON payload:', error);
      return fallback;
    }
  }

  toCsv(records) {
    const header = ['id', 'contentType', 'title', 'tags', 'createdAt', 'updatedAt'];
    const rows = records.map(record => [
      record.id,
      record.contentType,
      record.title.replace(/"/g, '""'),
      (record.tags || []).join('|').replace(/"/g, '""'),
      new Date(record.createdAt).toISOString(),
      new Date(record.updatedAt).toISOString(),
    ]);

    const csvRows = [header, ...rows]
      .map(columns => columns.map(column => `"${String(column)}"`).join(','))
      .join('\n');

    return csvRows;
  }

  toMarkdown(records) {
    const lines = records.map(record => {
      const tags = (record.tags || []).join(', ') || '—';
      return `- **${record.title}** _(type: ${record.contentType}, tags: ${tags})_\n  ${record.body.slice(0, 160)}${record.body.length > 160 ? '…' : ''}`;
    });

    return ['# Exported Memories', ...lines].join('\n');
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Unified AI Memory MCP server running on stdio');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new UnifiedAIMemoryMCPServer();

  server.start().catch(error => {
    console.error('Failed to start Unified AI Memory MCP server:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.error('\nShutting down Unified AI Memory MCP server...');
    process.exit(0);
  });
}

export { UnifiedAIMemoryMCPServer };
