# Columnist-DB AI Memory Guide

## Overview

Columnist-DB AI Memory is a comprehensive memory system that enables LLMs to manage their own context windows through persistent storage. It provides capabilities similar to Claude's Memory Tool, allowing AI assistants to store, retrieve, and search across various content types.

## 🎯 Core Concept

Traditional LLMs have limited context windows that reset between conversations. Columnist-DB AI Memory solves this by:

- **Persistent Storage**: Memory persists across different LLM sessions
- **Universal Content Support**: Store conversations, documents, web content, notes, and custom data
- **Semantic Search**: Find relevant content using vector embeddings and keyword matching
- **Cross-Session Context**: Maintain continuity between different AI assistant interactions

## 🤖 MCP Integration

Columnist-DB AI Memory integrates with LLMs through the Model Context Protocol (MCP), providing 12 specialized memory tools:

### Core Memory Operations

#### `store_content`
Universal content storage for any data type:
```typescript
await mcp.store_content({
  content: "Important project notes and insights",
  content_type: "note",
  title: "Project Insights",
  tags: "project, insights, important",
  metadata: JSON.stringify({
    priority: "high",
    project: "AI Integration"
  })
});
```

#### `search_memory`
Search across all stored content with filters:
```typescript
const results = await mcp.search_memory({
  query: "machine learning",
  content_type: "document",
  tags: "ai, technical",
  limit: 10
});
```

#### `get_content`
Retrieve specific content by ID:
```typescript
const content = await mcp.get_content({
  content_id: "mem_1234567890_abc123"
});
```

### Conversation Memory

#### `store_conversation`
Save AI conversation history:
```typescript
await mcp.store_conversation({
  messages: JSON.stringify([
    { role: "user", content: "What is machine learning?" },
    { role: "assistant", content: "Machine learning is..." },
    { role: "user", content: "Can you give examples?" },
    { role: "assistant", content: "Examples include..." }
  ]),
  summary: "Discussion about machine learning concepts and examples",
  tags: "ai, machine-learning, education"
});
```

#### `search_conversations`
Search conversation history:
```typescript
const conversations = await mcp.search_conversations({
  query: "neural networks",
  tags: "ai"
});
```

### Document Management

#### `store_document`
Store documents with rich metadata:
```typescript
await mcp.store_document({
  content: "Technical documentation about AI systems...",
  title: "AI Systems Documentation",
  author: "AI Assistant",
  document_type: "technical",
  tags: "ai, documentation, technical"
});
```

### Web Content

#### `store_web_content`
Archive web pages and online content:
```typescript
await mcp.store_web_content({
  content: "Web page content about neural networks...",
  url: "https://example.com/neural-networks",
  title: "Neural Networks Explained",
  summary: "Comprehensive guide to neural networks"
});
```

### Memory Management

#### `get_memory_stats`
Get memory usage statistics:
```typescript
const stats = await mcp.get_memory_stats();
// Returns: total items, by type, recent activity, top tags
```

#### `clear_memory`
Clear all or filtered content:
```typescript
// Clear all test data
await mcp.clear_memory({
  content_type: "test"
});

// Clear content with specific tags
await mcp.clear_memory({
  tags: "temporary, test"
});
```

#### `export_memory`
Export memory in various formats:
```typescript
// Export as JSON
const jsonExport = await mcp.export_memory({
  format: "json"
});

// Export conversations as CSV
const csvExport = await mcp.export_memory({
  format: "csv",
  content_type: "conversation"
});
```

### Advanced Features

#### `find_related_content`
Discover semantically related content:
```typescript
const related = await mcp.find_related_content({
  topic: "machine learning",
  similarity_threshold: 0.7
});
```

#### `summarize_content`
Generate summaries of stored content:
```typescript
const summary = await mcp.summarize_content({
  content_type: "conversation"
});
```

## 🔧 Setup and Configuration

### Installation

```bash
npm install columnist-db-ai-memory
```

### Claude Code Configuration

Add to your Claude Code configuration:
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

### Environment Variables

- `DB_NAME`: Database name (default: "ai-memory")
- `AUTH_TOKEN`: Optional authentication token

## 🎯 Use Cases

### LLM Context Management

**Problem**: LLMs forget context between sessions
**Solution**: Persistent memory storage

```typescript
// Store important context
await mcp.store_content({
  content: "User prefers technical explanations with code examples",
  content_type: "preference",
  title: "User Preferences",
  tags: "user, preferences, technical"
});

// Retrieve context in future sessions
const preferences = await mcp.search_memory({
  query: "user preferences",
  content_type: "preference"
});
```

### Research Assistant

**Problem**: Research context lost between sessions
**Solution**: Persistent research memory

```typescript
// Store research papers
await mcp.store_document({
  content: "Paper about transformer architectures...",
  title: "Attention Is All You Need",
  author: "Vaswani et al.",
  document_type: "research",
  tags: "transformers, attention, nlp"
});

// Find related research
const related = await mcp.find_related_content({
  topic: "neural networks",
  similarity_threshold: 0.8
});
```

### Customer Support

**Problem**: No memory of previous customer interactions
**Solution**: Conversation history storage

```typescript
// Store support conversation
await mcp.store_conversation({
  messages: JSON.stringify(supportChat),
  summary: "Customer issue with API integration",
  tags: "support, api, integration"
});

// Search for similar issues
const similarIssues = await mcp.search_conversations({
  query: "API integration error",
  tags: "support"
});
```

## 🔍 Best Practices

### Content Organization

1. **Use Descriptive Titles**: Help with search and identification
2. **Apply Relevant Tags**: Enable filtering and categorization
3. **Include Metadata**: Store additional context as JSON
4. **Regular Cleanup**: Use `clear_memory` for temporary data

### Search Optimization

1. **Use Content Type Filters**: Narrow search scope
2. **Leverage Tags**: Enable precise filtering
3. **Adjust Similarity Threshold**: Balance recall vs precision
4. **Use Multiple Queries**: Try different search approaches

### Memory Management

1. **Monitor Statistics**: Use `get_memory_stats` regularly
2. **Export Important Data**: Use `export_memory` for backups
3. **Clean Up Regularly**: Remove outdated or temporary content
4. **Use Related Content**: Leverage `find_related_content` for discovery

## 🚀 Advanced Patterns

### Context Window Extension

```typescript
// When context window is full, store important context
async function extendContextWindow(importantContext) {
  await mcp.store_content({
    content: importantContext,
    content_type: "context",
    title: "Important Context",
    tags: "context, important"
  });
}

// Retrieve context when needed
async function retrieveContext(query) {
  const results = await mcp.search_memory({
    query: query,
    content_type: "context"
  });
  return results.map(r => r.content);
}
```

### Personalization Memory

```typescript
// Store user preferences and patterns
async function storeUserPreferences(userId, preferences) {
  await mcp.store_content({
    content: JSON.stringify(preferences),
    content_type: "preference",
    title: `User Preferences: ${userId}`,
    tags: `user, preferences, ${userId}`
  });
}

// Retrieve preferences for personalization
async function getUserPreferences(userId) {
  const prefs = await mcp.search_memory({
    query: userId,
    content_type: "preference"
  });
  return prefs.length > 0 ? JSON.parse(prefs[0].content) : null;
}
```

## 📊 Performance Characteristics

- **Storage**: Client-side IndexedDB with offline capabilities
- **Search**: Hybrid TF-IDF + vector search with semantic capabilities
- **Scalability**: Designed for thousands of memory items
- **Persistence**: Cross-session data retention
- **Performance**: Optimized for real-time AI interactions

## 🔧 Troubleshooting

### Common Issues

1. **Tool Not Found**: Verify MCP server configuration
2. **Memory Not Persisting**: Check IndexedDB configuration
3. **Search Not Working**: Verify search indexes are built
4. **Performance Issues**: Monitor memory usage with `get_memory_stats`

### Debug Commands

```typescript
// Check available tools
console.log('Available memory tools:', Object.keys(mcp).filter(k => k.includes('memory')));

// Test basic functionality
const stats = await mcp.get_memory_stats();
console.log('Memory stats:', stats);

// Verify content storage
await mcp.store_content({
  content: "Test content",
  content_type: "test",
  title: "Test Item"
});

const results = await mcp.search_memory({
  query: "test"
});
console.log('Search results:', results);
```

## 🎉 Success Criteria

The AI Memory system is working correctly when:

✅ All 12 memory tools are available and functional
✅ Memory persists across different agent sessions
✅ Search and retrieval work accurately
✅ Cross-session context is maintained
✅ Performance meets real-time requirements

---

**Columnist-DB AI Memory**: Enabling LLMs to manage their own context windows through persistent memory storage.