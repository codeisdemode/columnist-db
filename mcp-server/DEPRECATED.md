# ⚠️ Research Assistant MCP - DEPRECATED

**This MCP server has been deprecated and replaced by the unified AI Memory MCP server.**

## What Changed

The Research Assistant MCP server (`mcp-server/`) has been replaced by the unified AI Memory MCP server (`packages/ai-memory/`). All research paper management capabilities are now available as part of the comprehensive AI memory system.

## Migration Guide

### Old Configuration (Deprecated)
```json
{
  "mcpServers": {
    "research-assistant": {
      "command": "node",
      "args": ["./mcp-server/standalone-server.js"],
      "env": {
        "DB_NAME": "research-assistant"
      }
    }
  }
}
```

### New Configuration (Recommended)
```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["./node_modules/columnist-db-ai-memory/index.js"],
      "env": {
        "DB_NAME": "ai-memory"
      }
    }
  }
}
```

### Tool Migration

| Old Tool | New Equivalent |
|----------|----------------|
| `add_research_paper` | `store_research_paper` |
| `search_papers` | `search_memory` with `content_type: "research"` |
| `get_research_summary` | `get_memory_stats` |

### Example Usage

#### Store Research Paper
```typescript
// Old (deprecated)
await mcp.add_research_paper({
  title: "Paper Title",
  authors: "Author 1, Author 2",
  abstract: "Paper abstract...",
  publication_date: "2024-01-01",
  tags: "ai, machine-learning"
});

// New
await mcp.store_research_paper({
  title: "Paper Title",
  authors: "Author 1, Author 2",
  abstract: "Paper abstract...",
  publication_date: "2024-01-01",
  tags: "ai, machine-learning",
  journal: "Conference Name" // Additional metadata
});
```

#### Search Research Papers
```typescript
// Old (deprecated)
const results = await mcp.search_papers({
  query: "machine learning",
  limit: 10
});

// New
const results = await mcp.search_memory({
  query: "machine learning",
  content_type: "research",
  limit: 10
});
```

## Benefits of Unified AI Memory MCP

- **More Tools**: 16 tools vs 3 tools
- **Universal Content**: Store conversations, documents, web content, notes, research papers, and custom data
- **Advanced Features**: Contextual search, memory consolidation, export capabilities
- **Better Integration**: Single server for all memory needs
- **Active Development**: Ongoing improvements and features

## Timeline

- **Deprecated**: September 2024
- **Removal**: Planned for Q1 2025

## Questions?

For migration assistance or questions, please refer to the main documentation in `AI_MEMORY_GUIDE.md` and `MEMORY_EXAMPLES.md`.

---

**Note**: The Research Assistant MCP server will continue to work but will not receive updates or bug fixes. We strongly recommend migrating to the unified AI Memory MCP server.