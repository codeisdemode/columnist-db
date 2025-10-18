# Quick Setup Guide

## Prerequisites
- Node.js 18+ installed
- columnist-db repository cloned

## Installation Steps

### 1. Install Dependencies
```bash
cd mcp-server
npm install
```

### 2. Configure Claude Code

Add to your Claude Code configuration (`~/.config/claude-code/config.json` on Linux/macOS or `%APPDATA%\claude-code\config.json` on Windows):

```json
{
  "mcpServers": {
    "research-assistant": {
      "command": "node",
      "args": [
        "C:\\Users\\paul-\\Documents\\columnist-db\\mcp-server\\standalone-server.js"
      ],
      "env": {
        "DB_NAME": "research-assistant"
      }
    }
  }
}
```

**Note**: Update the path to match your actual directory structure.

### 3. Restart Claude Code
Restart Claude Code to load the new MCP server configuration.

### 4. Verify Installation
In Claude Code, try using one of the research assistant tools:

```
Use the get_research_summary tool to see if the server is working.
```

## Testing the Server

You can test the server manually:

```bash
cd mcp-server
node standalone-server.js
```

The server should run silently (stdio transport).

## Usage Examples

### Add a Research Paper
```
Use the add_research_paper tool with:
- title: "Advanced Machine Learning Techniques"
- authors: "Alice Johnson, Bob Smith"
- abstract: "This paper discusses advanced ML techniques for data analysis."
- publication_date: "2024-02-01"
- tags: "machine-learning, data-science"
```

### Search for Papers
```
Use the search_papers tool with:
- query: "machine learning"
- limit: 5
```

### Get Research Summary
```
Use the get_research_summary tool
```

## Troubleshooting

### Server Not Found
- Check the path in the configuration file
- Ensure Node.js is installed and in PATH
- Verify the standalone-server.js file exists

### Permission Errors
- Ensure the database directory is writable
- Check file permissions on the server script

### Connection Issues
- Restart Claude Code after configuration changes
- Check Claude Code logs for error messages

## Next Steps

1. Add some sample papers using the `add_research_paper` tool
2. Experiment with search functionality
3. Try adding notes to papers
4. Explore the analysis tools for research insights