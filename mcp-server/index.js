#!/usr/bin/env node

/**
 * Columnist-DB MCP Server for Research Assistant
 *
 * This MCP server provides AI tools for managing research papers and notes
 * through columnist-db. It can be used with Claude Code, ChatGPT, and other
 * MCP-compatible AI assistants.
 */

import { ColumnistMCPServer } from 'columnist-db-core';

class ResearchAssistantMCPServer extends ColumnistMCPServer {
  constructor(config) {
    super(config);
    this.researchTools = this.createResearchTools();
  }

  createResearchTools() {
    return {
      // Paper Management Tools
      add_research_paper: {
        description: "Add a new research paper to the database",
        parameters: {
          title: { type: "string", description: "Paper title" },
          authors: { type: "string", description: "Comma-separated list of authors" },
          abstract: { type: "string", description: "Paper abstract" },
          publication_date: { type: "string", description: "Publication date (YYYY-MM-DD)" },
          tags: { type: "string", description: "Comma-separated tags" },
          url: { type: "string", description: "Paper URL (optional)" }
        }
      },

      search_papers: {
        description: "Search research papers by title, abstract, authors, or tags",
        parameters: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Maximum number of results", optional: true }
        }
      },

      get_paper_details: {
        description: "Get detailed information about a specific paper",
        parameters: {
          paper_id: { type: "string", description: "Paper ID" }
        }
      },

      // Note Management Tools
      add_research_note: {
        description: "Add a research note to a paper",
        parameters: {
          paper_id: { type: "string", description: "Paper ID" },
          content: { type: "string", description: "Note content" },
          tags: { type: "string", description: "Comma-separated tags", optional: true }
        }
      },

      get_paper_notes: {
        description: "Get all notes for a specific paper",
        parameters: {
          paper_id: { type: "string", description: "Paper ID" }
        }
      },

      search_notes: {
        description: "Search research notes by content",
        parameters: {
          query: { type: "string", description: "Search query" },
          paper_id: { type: "string", description: "Filter by paper ID", optional: true }
        }
      },

      // Analysis Tools
      get_research_summary: {
        description: "Get a summary of research progress and statistics",
        parameters: {}
      },

      find_related_papers: {
        description: "Find papers related to a specific topic or paper",
        parameters: {
          topic: { type: "string", description: "Topic or paper title" }
        }
      },

      analyze_research_trends: {
        description: "Analyze trends in research collection",
        parameters: {
          timeframe: { type: "string", description: "Timeframe (e.g., 'last year', 'all time')", optional: true }
        }
      },

      // Export Tools
      export_research_data: {
        description: "Export research data to various formats",
        parameters: {
          format: { type: "string", description: "Export format (json, csv, bibtex)" },
          include_notes: { type: "boolean", description: "Include research notes", optional: true }
        }
      }
    };
  }

  setupProtocolHandlers() {
    super.setupProtocolHandlers();

    // Enhanced discovery with research-specific tools
    this.server.setRequestHandler('mcp/discovery', async () => ({
      name: 'research-assistant-mcp-server',
      version: '1.0.0',
      capabilities: {
        resources: {
          subscribe: false
        },
        tools: this.researchTools
      }
    }));

    // Enhanced tool execution with research-specific handlers
    this.server.setRequestHandler('mcp/tools/call', async (params) => {
      const { name, arguments: args } = params;

      // Handle research-specific tools
      switch (name) {
        case 'add_research_paper':
          return await this.handleAddResearchPaper(args);
        case 'search_papers':
          return await this.handleSearchPapers(args);
        case 'get_paper_details':
          return await this.handleGetPaperDetails(args);
        case 'add_research_note':
          return await this.handleAddResearchNote(args);
        case 'get_paper_notes':
          return await this.handleGetPaperNotes(args);
        case 'search_notes':
          return await this.handleSearchNotes(args);
        case 'get_research_summary':
          return await this.handleGetResearchSummary(args);
        case 'find_related_papers':
          return await this.handleFindRelatedPapers(args);
        case 'analyze_research_trends':
          return await this.handleAnalyzeResearchTrends(args);
        case 'export_research_data':
          return await this.handleExportResearchData(args);
        default:
          // Fall back to base class tools
          return await super.handleToolCall(name, args);
      }
    });
  }

  async handleAddResearchPaper(args) {
    const { title, authors, abstract, publication_date, tags, url } = args;

    const paper = {
      id: this.generateId(),
      title,
      authors,
      abstract,
      publicationDate: new Date(publication_date),
      tags,
      url: url || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.adapter.insert('papers', paper);

    return {
      content: [{
        type: 'text',
        text: `Paper "${title}" added successfully with ID: ${result.ids[0]}`
      }]
    };
  }

  async handleSearchPapers(args) {
    const { query, limit = 10 } = args;

    const results = await this.adapter.search('papers', query, { limit });

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No papers found matching "${query}"`
        }]
      };
    }

    const resultText = results.map((paper, index) =>
      `${index + 1}. ${paper.title}\n   Authors: ${paper.authors}\n   ID: ${paper.id}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} papers:\n\n${resultText}`
      }]
    };
  }

  async handleGetPaperDetails(args) {
    const { paper_id } = args;

    const papers = await this.adapter.query('papers', {
      where: { id: paper_id }
    });

    if (papers.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Paper with ID ${paper_id} not found`
        }]
      };
    }

    const paper = papers[0];
    const notes = await this.adapter.query('notes', {
      where: { paperId: paper_id }
    });

    const details = `
Paper: ${paper.title}
Authors: ${paper.authors}
Published: ${paper.publicationDate}
Abstract: ${paper.abstract.substring(0, 200)}...
Tags: ${paper.tags}
Notes: ${notes.length} research notes
URL: ${paper.url || 'Not provided'}
    `.trim();

    return {
      content: [{
        type: 'text',
        text: details
      }]
    };
  }

  async handleAddResearchNote(args) {
    const { paper_id, content, tags = '' } = args;

    // Verify paper exists
    const papers = await this.adapter.query('papers', {
      where: { id: paper_id }
    });

    if (papers.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Paper with ID ${paper_id} not found`
        }]
      };
    }

    const note = {
      id: this.generateId(),
      content,
      tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      paperId: paper_id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.adapter.insert('notes', note);

    return {
      content: [{
        type: 'text',
        text: `Note added to paper "${papers[0].title}" successfully`
      }]
    };
  }

  async handleGetPaperNotes(args) {
    const { paper_id } = args;

    const notes = await this.adapter.query('notes', {
      where: { paperId: paper_id },
      orderBy: { createdAt: 'DESC' }
    });

    if (notes.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No notes found for paper ID ${paper_id}`
        }]
      };
    }

    const notesText = notes.map((note, index) =>
      `${index + 1}. ${note.content.substring(0, 100)}...\n   Created: ${note.createdAt}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${notes.length} notes:\n\n${notesText}`
      }]
    };
  }

  async handleSearchNotes(args) {
    const { query, paper_id } = args;

    let where = {};
    if (paper_id) {
      where.paperId = paper_id;
    }

    const notes = await this.adapter.query('notes', { where });
    const filteredNotes = notes.filter(note =>
      note.content.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredNotes.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No notes found matching "${query}"`
        }]
      };
    }

    const resultText = filteredNotes.map((note, index) =>
      `${index + 1}. ${note.content.substring(0, 100)}...`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${filteredNotes.length} notes:\n\n${resultText}`
      }]
    };
  }

  async handleGetResearchSummary(args) {
    const papers = await this.adapter.query('papers', {});
    const notes = await this.adapter.query('notes', {});

    const summary = `
Research Summary:
- Total Papers: ${papers.length}
- Total Notes: ${notes.length}
- Papers with Notes: ${new Set(notes.map(n => n.paperId)).size}
- Most Recent Paper: ${papers.length > 0 ? papers[papers.length - 1].title : 'None'}
- Average Notes per Paper: ${papers.length > 0 ? (notes.length / papers.length).toFixed(1) : 0}
    `.trim();

    return {
      content: [{
        type: 'text',
        text: summary
      }]
    };
  }

  async handleFindRelatedPapers(args) {
    const { topic } = args;

    const papers = await this.adapter.search('papers', topic, { limit: 5 });

    if (papers.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No papers found related to "${topic}"`
        }]
      };
    }

    const resultText = papers.map((paper, index) =>
      `${index + 1}. ${paper.title}\n   Relevance: ${this.calculateRelevance(paper, topic)}/10`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${papers.length} papers related to "${topic}":\n\n${resultText}`
      }]
    };
  }

  async handleAnalyzeResearchTrends(args) {
    const { timeframe = 'all time' } = args;

    const papers = await this.adapter.query('papers', {});

    // Simple trend analysis based on publication dates
    const currentYear = new Date().getFullYear();
    const yearlyCounts = {};

    papers.forEach(paper => {
      const year = new Date(paper.publicationDate).getFullYear();
      yearlyCounts[year] = (yearlyCounts[year] || 0) + 1;
    });

    const trendText = Object.keys(yearlyCounts)
      .sort()
      .map(year => `${year}: ${yearlyCounts[year]} papers`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `Research Trends (${timeframe}):\n\n${trendText}`
      }]
    };
  }

  async handleExportResearchData(args) {
    const { format = 'json', include_notes = false } = args;

    const papers = await this.adapter.query('papers', {});
    let notes = [];

    if (include_notes) {
      notes = await this.adapter.query('notes', {});
    }

    let exportData;

    switch (format) {
      case 'json':
        exportData = JSON.stringify({ papers, notes }, null, 2);
        break;
      case 'csv':
        exportData = this.convertToCSV(papers, notes);
        break;
      case 'bibtex':
        exportData = this.convertToBibTeX(papers);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return {
      content: [{
        type: 'text',
        text: `Research data exported in ${format.toUpperCase()} format:\n\n${exportData}`
      }]
    };
  }

  // Helper methods
  generateId() {
    return 'paper_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  calculateRelevance(paper, topic) {
    // Simple relevance scoring based on text matching
    const text = `${paper.title} ${paper.abstract} ${paper.tags}`.toLowerCase();
    const topicLower = topic.toLowerCase();

    let score = 0;
    if (text.includes(topicLower)) score += 5;
    if (paper.title.toLowerCase().includes(topicLower)) score += 3;
    if (paper.tags.toLowerCase().includes(topicLower)) score += 2;

    return Math.min(10, score);
  }

  convertToCSV(papers, notes) {
    // Simple CSV conversion
    const papersCSV = papers.map(paper =>
      `"${paper.title}","${paper.authors}","${paper.publicationDate}","${paper.tags}"`
    ).join('\n');

    return `Papers:\n${papersCSV}`;
  }

  convertToBibTeX(papers) {
    // Simple BibTeX conversion
    return papers.map(paper =>
      `@article{${paper.id.replace(/[^a-zA-Z0-9]/g, '')},
  title = {${paper.title}},
  author = {${paper.authors}},
  year = {${new Date(paper.publicationDate).getFullYear()}}
}`
    ).join('\n\n');
  }
}

// CLI interface
if (require.main === module) {
  const config = {
    databaseName: process.env.DB_NAME || 'research-assistant',
    authToken: process.env.AUTH_TOKEN
  };

  const server = new ResearchAssistantMCPServer(config);

  server.start().catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down MCP server...');
    await server.stop();
    process.exit(0);
  });
}

export { ResearchAssistantMCPServer };