#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Columnist } from 'columnist-db-core';

const DEFAULT_DB_NAME = 'research-assistant-mcp';

class ResearchAssistantMCPServer {
  constructor() {
    this.dbReady = this.initializeDatabase();

    this.server = new Server(
      {
        name: 'research-assistant-mcp-server',
        version: '1.0.0',
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
    const db = await Columnist.init(DEFAULT_DB_NAME, {
      autoInitialize: false,
      schema: {
        papers: {
          columns: {
            id: 'number',
            title: 'string',
            authors: 'string',
            abstract: 'string',
            publicationDate: 'date',
            tagString: 'string',
            tags: 'json',
            url: 'string',
            createdAt: 'date',
            updatedAt: 'date',
          },
          primaryKey: 'id',
          searchableFields: ['title', 'authors', 'abstract', 'tagString'],
          secondaryIndexes: ['publicationDate'],
        },
      },
    });

    return db;
  }

  async getDb() {
    return this.dbReady;
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'add_research_paper',
          description: 'Add a new research paper to the local ColumnistDB instance',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Paper title' },
              authors: { type: 'string', description: 'Comma-separated list of authors' },
              abstract: { type: 'string', description: 'Paper abstract' },
              publication_date: { type: 'string', description: 'Publication date (YYYY-MM-DD)' },
              tags: { type: 'string', description: 'Comma-separated tags', optional: true },
              url: { type: 'string', description: 'Paper URL (optional)' },
            },
            required: ['title', 'authors', 'abstract', 'publication_date'],
          },
        },
        {
          name: 'search_papers',
          description: 'Search stored research papers by title, abstract, or authors',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Maximum number of results', optional: true },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_research_summary',
          description: 'Summarise the stored research corpus with live metrics',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args = {} } = request.params;

      switch (name) {
        case 'add_research_paper':
          return this.handleAddResearchPaper(args);
        case 'search_papers':
          return this.handleSearchPapers(args);
        case 'get_research_summary':
          return this.handleGetResearchSummary();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async handleAddResearchPaper(args) {
    const db = await this.getDb();

    const {
      title,
      authors,
      abstract,
      publication_date: publicationDate,
      tags = '',
      url = '',
    } = args;

    const tagList = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    const now = new Date();
    const record = {
      title,
      authors,
      abstract,
      publicationDate: publicationDate ? new Date(publicationDate) : now,
      tagString: tagList.join(', '),
      tags: tagList,
      url,
      createdAt: now,
      updatedAt: now,
    };

    const { id } = await db.insert(record, 'papers');

    return {
      content: [
        {
          type: 'text',
          text: `Stored "${title}" with id ${id}. ${tagList.length ? `Tags: ${tagList.join(', ')}` : 'No tags supplied.'}`,
        },
      ],
    };
  }

  async handleSearchPapers(args) {
    const db = await this.getDb();
    const { query, limit = 5 } = args;

    const rawResults = await db.search(query, {
      table: 'papers',
      limit: limit * 2,
    });

    if (rawResults.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No papers found matching "${query}".`,
          },
        ],
      };
    }

    const results = rawResults.slice(0, limit).map((paper, index) => {
      const published = paper.publicationDate
        ? new Date(paper.publicationDate).toISOString().split('T')[0]
        : 'Unknown';
      const tags = (paper.tags || [])
        .map(tag => tag.toString())
        .filter(Boolean)
        .join(', ');
      return `${index + 1}. ${paper.title}\n   Authors: ${paper.authors}\n   Published: ${published}\n   Tags: ${tags || '—'}`;
    });

    return {
      content: [
        {
          type: 'text',
          text: `Found ${rawResults.length} result(s) for "${query}":\n\n${results.join('\n\n')}`,
        },
      ],
    };
  }

  async handleGetResearchSummary() {
    const db = await this.getDb();
    const papers = await db.getAll('papers', Number.MAX_SAFE_INTEGER);

    if (papers.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No research papers have been stored yet.',
          },
        ],
      };
    }

    const mostRecent = papers
      .slice()
      .sort((a, b) => new Date(b.publicationDate || 0).valueOf() - new Date(a.publicationDate || 0).valueOf())[0];

    const tagFrequency = new Map();
    const authorFrequency = new Map();

    for (const paper of papers) {
      const tags = (paper.tags || [])
        .map(tag => tag.toString())
        .filter(Boolean);
      for (const tag of tags) {
        tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
      }

      const authorList = paper.authors.split(',').map(name => name.trim());
      for (const author of authorList) {
        if (author) {
          authorFrequency.set(author, (authorFrequency.get(author) || 0) + 1);
        }
      }
    }

    const topTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => `${tag} (${count})`)
      .join(', ');

    const prolificAuthors = Array.from(authorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([author, count]) => `${author} (${count})`)
      .join(', ');

    const summary = [
      `Total papers: ${papers.length}`,
      `Most recent: ${mostRecent.title} (${new Date(mostRecent.publicationDate || mostRecent.createdAt).toISOString().split('T')[0]})`,
      `Unique tags: ${tagFrequency.size}`,
      `Top tags: ${topTags || '—'}`,
      `Most prolific authors: ${prolificAuthors || '—'}`,
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: summary,
        },
      ],
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Research Assistant MCP server running on stdio');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ResearchAssistantMCPServer();

  server.start().catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.error('\nShutting down MCP server...');
    process.exit(0);
  });
}

export { ResearchAssistantMCPServer };
