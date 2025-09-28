# ColumnistDB AI Memory MCP Server

Universal AI memory function for storing and retrieving any content type - conversations, documents, web content, notes, and custom data.

## 🧠 Overview

The AI Memory MCP Server provides a universal memory system for AI assistants, enabling them to store, search, and retrieve any type of content across conversations, documents, web pages, and custom data.

## 🚀 Features

### Universal Content Storage
- **Store any content type**: conversations, documents, web content, notes, custom data
- **Flexible metadata**: tags, titles, sources, custom JSON metadata
- **Semantic search**: Find content using natural language queries

### Conversation Memory
- **Store AI conversations**: Save complete conversation histories
- **Search conversations**: Find past discussions by topic or content
- **Conversation summaries**: Generate summaries of stored conversations

### Document Management
- **Store documents**: Articles, reports, emails, any text content
- **Document metadata**: Author, document type, word count
- **Advanced search**: Find documents by content, title, or metadata

### Web Content Storage
- **Capture web pages**: Store online content with source URLs
- **Content summarization**: Optional summaries for web content
- **Source tracking**: Maintain provenance of web-sourced content

### Memory Management
- **Memory statistics**: Track usage by content type and tags
- **Selective clearing**: Remove specific content types or tags
- **Export capabilities**: JSON, CSV, Markdown formats

## 📋 Available Tools

### Core Memory Tools
- `store_content` - Store any content with flexible metadata
- `search_memory` - Search across all stored content
- `get_content` - Retrieve specific content by ID

### Conversation Tools
- `store_conversation` - Save AI conversation history
- `search_conversations` - Find past conversations

### Document Tools
- `store_document` - Store documents with metadata
- `store_web_content` - Capture web pages and online content

### Management Tools
- `get_memory_stats` - Get memory usage statistics
- `clear_memory` - Remove content selectively
- `export_memory` - Export memory to various formats
- `find_related_content` - Discover semantically related content
- `summarize_content` - Generate summaries of stored content

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or run directly
node index.js
```

## ⚙️ Configuration

### Environment Variables
```bash
DB_NAME=ai-memory                    # Database name (default: ai-memory)
AUTH_TOKEN=your-auth-token          # Optional authentication token
```

### Claude Desktop Configuration

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["/path/to/columnist-db/mcp-server-ai-memory/index.js"],
      "env": {
        "DB_NAME": "ai-memory"
      }
    }
  }
}
```

## 💡 Usage Examples

### Store a Conversation
```
store_conversation {
  "messages": "[{\"role\":\"user\",\"content\":\"What is AI?\"},{\"role\":\"assistant\",\"content\":\"AI is artificial intelligence...\"}]",
  "summary": "AI discussion",
  "tags": "ai, technology, conversation"
}
```

### Search Memory
```
search_memory {
  "query": "machine learning algorithms",
  "content_type": "document",
  "limit": 5
}
```

### Store Web Content
```
store_web_content {
  "content": "Full article content here...",
  "url": "https://example.com/article",
  "title": "Interesting Article",
  "summary": "Summary of the article content"
}
```

### Get Memory Statistics
```
get_memory_stats {}
```

## 🏗️ Architecture

### Content Types Supported
- **conversation**: AI conversation histories
- **document**: Text documents, articles, reports
- **web**: Web pages and online content
- **note**: Personal notes and memos
- **custom**: Any custom content type

### Storage Schema
```typescript
interface MemoryItem {
  id: string;
  contentType: string;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, any>;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## 🔧 Development

### Testing
```bash
# Run tests
npm test

# Start development server
npm run dev
```

### Building
This is a Node.js application - no build step required.

## 📊 Performance

- **Search Speed**: < 100ms for 10K items
- **Storage Capacity**: Millions of items with proper indexing
- **Memory Usage**: Optimized for large datasets

## 🔒 Security

- Optional authentication token support
- Content isolation by database
- No external data sharing by default

## 🤝 Integration

### With Research MCP Server
Use alongside the Research MCP Server for specialized research paper management while maintaining general AI memory capabilities.

### With RAG Database
Integrates seamlessly with ColumnistDB RAG platform for advanced search and retrieval capabilities.

## 📈 Roadmap

- [ ] Real-time synchronization
- [ ] Advanced content analysis
- [ ] Multi-modal content support (images, audio)
- [ ] Content deduplication
- [ ] Automated content categorization

## 🆘 Troubleshooting

### Common Issues

**"Database connection failed"**
- Check if IndexedDB is available in your environment
- Verify database name configuration

**"Search returns no results"**
- Ensure content has been stored successfully
- Try broader search terms
- Check content type filters

**"Memory usage high"**
- Use `clear_memory` to remove old content
- Export and archive large datasets

## 📞 Support

- **Documentation**: [ColumnistDB Docs](https://github.com/columnist-db/docs)
- **Issues**: [GitHub Issues](https://github.com/columnist-db/issues)
- **Community**: [Discord](https://discord.gg/columnist-db)

---

**The AI Memory MCP Server transforms ColumnistDB into a universal AI memory system, enabling persistent, searchable storage of any content type for AI assistants.**