# Research Assistant MCP Server

A Model Context Protocol (MCP) server for managing research papers and notes using columnist-db. This server enables AI assistants like Claude Code and ChatGPT to interact with your research database.

## Features

- **Paper Management**: Add, search, and retrieve research papers
- **Note Management**: Add and search research notes linked to papers
- **AI-Powered Analysis**: Get research summaries and trend analysis
- **Export Capabilities**: Export data in JSON, CSV, and BibTeX formats

## Available Tools

### Paper Management
- `add_research_paper` - Add a new research paper
- `search_papers` - Search papers by title, abstract, authors, or tags
- `get_paper_details` - Get detailed information about a specific paper

### Note Management
- `add_research_note` - Add a research note to a paper
- `get_paper_notes` - Get all notes for a specific paper
- `search_notes` - Search research notes by content

### Analysis Tools
- `get_research_summary` - Get a summary of research progress and statistics
- `find_related_papers` - Find papers related to a specific topic or paper
- `analyze_research_trends` - Analyze trends in research collection

### Export Tools
- `export_research_data` - Export research data to various formats

## Installation

1. Ensure you have Node.js 18+ installed
2. Clone the columnist-db repository
3. Navigate to the mcp-server directory:
   ```bash
   cd mcp-server
   ```
4. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

### Claude Code Configuration

Add the following to your Claude Code configuration file:

```json
{
  "mcpServers": {
    "research-assistant": {
      "command": "node",
      "args": [
        "/path/to/columnist-db/mcp-server/standalone-server.js"
      ],
      "env": {
        "DB_NAME": "research-assistant",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### ChatGPT Configuration

For ChatGPT desktop app, add the configuration to your MCP settings.

## Usage Examples

### Adding a Research Paper
```
Use the add_research_paper tool with:
- title: "Machine Learning in Healthcare"
- authors: "John Smith, Jane Doe"
- abstract: "This paper explores ML applications in healthcare diagnostics."
- publication_date: "2024-01-15"
- tags: "machine-learning, healthcare, ai"
```

### Searching Papers
```
Use the search_papers tool with:
- query: "machine learning healthcare"
- limit: 5
```

### Getting Research Summary
```
Use the get_research_summary tool to get an overview of your research collection.
```

## Database Schema

The MCP server uses the following database schema:

### Papers Table
- `id` (string): Unique identifier
- `title` (string): Paper title
- `authors` (string): Comma-separated list of authors
- `abstract` (string): Paper abstract
- `publicationDate` (date): Publication date
- `tags` (string): Comma-separated tags
- `abstract` (string): Indexed for both keyword and vector search using the BasicEmbeddingProvider

### Notes Table
- `id` (string): Unique identifier
- `content` (string): Note content
- `tags` (array): Array of tags
- `paperId` (string): Reference to parent paper

## Development

### Running the Server
```bash
cd mcp-server
npm start
```

### Testing
```bash
npm test
```

## API Reference

### Tool: add_research_paper
**Description**: Add a new research paper to the database

**Parameters**:
- `title` (string, required): Paper title
- `authors` (string, required): Comma-separated list of authors
- `abstract` (string, required): Paper abstract
- `publication_date` (string, required): Publication date (YYYY-MM-DD)
- `tags` (string, optional): Comma-separated tags
- `url` (string, optional): Paper URL

### Tool: search_papers
**Description**: Search research papers by title, abstract, authors, or tags

**Parameters**:
- `query` (string, required): Search query
- `limit` (number, optional): Maximum number of results (default: 10)

## Troubleshooting

### Common Issues

1. **Server not starting**: Ensure Node.js 18+ is installed and dependencies are properly installed.
2. **Database errors**: Check that the database path is accessible and writable.
3. **Search not returning results**: Verify that papers have been added with proper indexing.

### Debug Mode

Set `NODE_ENV=development` to enable debug logging:

```bash
NODE_ENV=development node standalone-server.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is part of the columnist-db ecosystem. See the main repository for license information.