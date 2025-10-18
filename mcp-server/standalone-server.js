#!/usr/bin/env node

/**
 * Standalone Research Assistant MCP Server
 *
 * This is a simplified version that implements the MCP protocol directly
 * without relying on columnist-db-core's MCP implementation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema
} from '@modelcontextprotocol/sdk/types.js';

class ResearchAssistantMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'research-assistant-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'add_research_paper',
          description: 'Add a new research paper to the database',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Paper title' },
              authors: { type: 'string', description: 'Comma-separated list of authors' },
              abstract: { type: 'string', description: 'Paper abstract' },
              publication_date: { type: 'string', description: 'Publication date (YYYY-MM-DD)' },
              tags: { type: 'string', description: 'Comma-separated tags' },
              url: { type: 'string', description: 'Paper URL (optional)' }
            },
            required: ['title', 'authors', 'abstract', 'publication_date']
          }
        },
        {
          name: 'search_papers',
          description: 'Search research papers by title, abstract, authors, or tags',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Maximum number of results', optional: true }
            },
            required: ['query']
          }
        },
        {
          name: 'get_research_summary',
          description: 'Get a summary of research progress and statistics',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'add_research_paper':
          return await this.handleAddResearchPaper(args);
        case 'search_papers':
          return await this.handleSearchPapers(args);
        case 'get_research_summary':
          return await this.handleGetResearchSummary(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async handleAddResearchPaper(args) {
    const { title, authors, abstract, publication_date, tags, url } = args;

    // Simulate database operation
    const paper = {
      id: 'paper_' + Date.now(),
      title,
      authors,
      abstract,
      publicationDate: publication_date,
      tags: tags || '',
      url: url || '',
      createdAt: new Date().toISOString()
    };

    return {
      content: [{
        type: 'text',
        text: `Paper "${title}" added successfully with ID: ${paper.id}`
      }]
    };
  }

  async handleSearchPapers(args) {
    const { query, limit = 10 } = args;

    // Simulate search operation
    const mockResults = [
      {
        id: 'paper_1',
        title: 'Machine Learning in Healthcare',
        authors: 'John Smith, Jane Doe',
        abstract: 'This paper explores the application of machine learning algorithms in healthcare diagnostics.',
        publicationDate: '2024-01-15',
        tags: 'machine-learning, healthcare, ai'
      }
    ];

    const filteredResults = mockResults.filter(paper =>
      paper.title.toLowerCase().includes(query.toLowerCase()) ||
      paper.abstract.toLowerCase().includes(query.toLowerCase())
    ).slice(0, limit);

    if (filteredResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No papers found matching "${query}"`
        }]
      };
    }

    const resultText = filteredResults.map((paper, index) =>
      `${index + 1}. ${paper.title}\n   Authors: ${paper.authors}\n   ID: ${paper.id}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${filteredResults.length} papers:\n\n${resultText}`
      }]
    };
  }

  async handleGetResearchSummary(args) {
    // Simulate summary data
    const summary = `
Research Summary:
- Total Papers: 5
- Total Notes: 12
- Most Recent Paper: Machine Learning in Healthcare
- Papers with Notes: 3
- Average Notes per Paper: 2.4
    `.trim();

    return {
      content: [{
        type: 'text',
        text: summary
      }]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Research Assistant MCP server running on stdio');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ResearchAssistantMCPServer();

  server.start().catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\nShutting down MCP server...');
    process.exit(0);
  });
}

export { ResearchAssistantMCPServer };