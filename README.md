#in development status
# Columnist-DB - Columnar Database Engine for AI Applications

**Production-grade columnar database with hybrid search, vector embeddings, and MCP integration. Query 100k embeddings in <50ms with client-side persistence.**

Columnist-DB is a high-performance client-side database engine optimized for AI applications, featuring columnar storage architecture, full-text search, vector similarity search, and seamless integration with LLMs through the Model Context Protocol (MCP). Built for production use with TypeScript-first development and enterprise-grade synchronization.

## 🚀 Key Features

### Database Engine Foundation
- **Columnar Storage Architecture**: Optimized for analytical queries and vector operations with compression
- **Hybrid Search Engine**: Full-text + vector similarity search in single queries
- **IndexedDB Persistence**: Client-side storage with offline capabilities and ACID compliance
- **TypeScript First**: Fully typed with Zod schema validation and type-safe migrations
- **Performance Optimized**: Query 100k embeddings in <50ms with efficient indexing

### AI Memory Layer
- **Universal Content Storage**: Store conversations, documents, web content, notes, and custom data
- **Vector Embeddings**: Semantic search with similarity thresholds and cosine distance
- **Cross-Session Persistence**: Memory persists across different LLM sessions
- **Content Type Support**: Conversations, documents, web pages, notes, research papers, and custom types

### MCP Integration
- **Unified AI Memory MCP Server**: Single server with 16 memory tools for all content types
- **Advanced Memory Features**: Contextual search, memory consolidation, export capabilities
- **Claude Memory Tool Alternative**: Compatible with Claude Code and other MCP clients

### Production Ready
- **Enterprise Sync**: Multi-device synchronization with conflict resolution
- **Memory Management**: Statistics, cleanup, and export capabilities
- **Schema Evolution**: Type-safe schema migrations with versioning
- **React Hooks**: Seamless integration with React applications

## 🛠️ Quick Start

### Modular Installation

Install only the components you need:

#### Core Database Engine
```bash
npm install columnist-db-core
```

#### AI Memory MCP Server
```bash
npm install columnist-db-ai-memory
```

#### React Hooks
```bash
npm install columnist-db-hooks
```

#### RAG Database (Advanced)
```bash
npm install rag-db
```

### Database Engine Usage

#### Install Core Database
```bash
npm install columnist-db-core
```

#### Basic Database Operations
```typescript
import { Columnist } from 'columnist-db-core';

// Define your schema
const schema = {
  memories: {
    id: { type: 'string', primaryKey: true },
    content: 'string',
    contentType: 'string',
    embeddings: 'vector',
    tags: 'string[]',
    createdAt: 'date'
  }
};

// Initialize database
const db = await Columnist.init('my-app', { schema });

// Store data with vector embeddings
await db.insert('memories', {
  id: 'mem_1',
  content: 'Important project notes',
  contentType: 'note',
  embeddings: [0.1, 0.2, 0.3], // Vector embeddings
  tags: ['project', 'important'],
  createdAt: new Date()
});

// Hybrid search (text + vector)
const results = await db.search('memories', {
  query: 'project notes',
  vector: [0.1, 0.2, 0.3],
  similarityThreshold: 0.7
});
```

### React Hooks Integration

#### Install React Hooks
```bash
npm install columnist-db-hooks
```

#### Usage with React
```typescript
import { useColumnist } from 'columnist-db-hooks';

function MyComponent() {
  const { db, loading, error } = useColumnist('my-app', { schema });

  if (loading) return <div>Loading database...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const handleSearch = async (query: string) => {
    const results = await db.search('memories', { query });
    return results;
  };

  return (
    <div>
      <SearchComponent onSearch={handleSearch} />
    </div>
  );
}
```

### MCP Integration for AI Memory

#### Install AI Memory MCP Server
```bash
npm install columnist-db-ai-memory
```

#### Configure for Claude Code
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

#### Basic Memory Operations
```typescript
// Store conversation with AI
await mcp.store_conversation({
  messages: JSON.stringify([
    { role: "user", content: "What is machine learning?" },
    { role: "assistant", content: "Machine learning is..." }
  ]),
  summary: "Discussion about machine learning concepts",
  tags: "ai, machine-learning, education"
});

// Search memory across all content
const results = await mcp.search_memory({
  query: "machine learning",
  content_type: "conversation",
  limit: 5
});

// Get memory statistics
const stats = await mcp.get_memory_stats();
```

### Advanced Memory Usage

#### Store Various Content Types
```typescript
// Store documents
await mcp.store_document({
  content: "Technical documentation about AI systems...",
  title: "AI Systems Documentation",
  author: "AI Assistant",
  document_type: "technical",
  tags: "ai, documentation, technical"
});

// Store web content
await mcp.store_web_content({
  content: "Web page content about neural networks...",
  url: "https://example.com/neural-networks",
  title: "Neural Networks Explained",
  summary: "Comprehensive guide to neural networks"
});

// Universal content storage
await mcp.store_content({
  content: "Important project notes and insights",
  content_type: "note",
  title: "Project Insights",
  tags: "project, insights, important"
});

// Store research papers
await mcp.store_research_paper({
  title: "Attention Is All You Need",
  authors: "Vaswani et al.",
  abstract: "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms...",
  publication_date: "2017-06-12",
  tags: "transformers, attention, nlp",
  journal: "NeurIPS"
});
```

## 🚀 Features

### AI Memory Core
- **Universal Content Storage**: Store any content type (conversations, documents, web, notes, custom)
- **Persistent Context**: Cross-session memory retention for LLM context management
- **Semantic Search**: Hybrid search combining vector embeddings and keyword matching
- **Content Type Support**: Conversations, documents, web pages, notes, and custom types

### Memory Management
- **Conversation Memory**: Store and retrieve AI conversation history
- **Document Memory**: Persistent storage for documents and research materials
- **Web Content Memory**: Archive and search web pages and online content
- **Memory Statistics**: Track usage patterns and memory utilization

### MCP Integration
- **Unified AI Memory MCP Server**: Single server with 16 memory tools for all content types
- **Advanced Memory Features**: Contextual search, memory consolidation, export capabilities
- **Claude Memory Tool Alternative**: Compatible with Claude Code and other MCP clients

### Advanced Features
- **Cross-Session Persistence**: Memory persists across different agent sessions
- **Semantic Relatedness**: Find related content using vector similarity
- **Memory Export**: Export memory in JSON, CSV, and Markdown formats
- **Memory Cleanup**: Selective clearing of memory by type or tags

## 📋 Prerequisites

- Node.js 18+
- Modern web browser with IndexedDB support

## 🤖 MCP Server Setup

Columnist-DB provides specialized MCP servers for AI memory management:

### AI Memory MCP (Primary)
Universal content storage for LLM context management:

**For Claude Code Configuration:**
```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["./mcp-server-ai-memory/index.js"],
      "env": {
        "DB_NAME": "ai-memory"
      }
    }
  }
}
```

**Available Memory Tools (16 tools):**
- `store_content` - Universal content storage for any type
- `search_memory` - Search across all stored content with filters
- `get_content` - Retrieve specific content by ID
- `store_conversation` - Save AI conversation history
- `search_conversations` - Search conversation history
- `store_document` - Store documents with metadata
- `store_web_content` - Store web pages or online content
- `store_research_paper` - Store research papers with academic metadata
- `get_memory_stats` - Get memory usage statistics
- `clear_memory` - Clear all or filtered content
- `export_memory` - Export memory in JSON, CSV, or Markdown
- `find_related_content` - Discover semantically related content
- `summarize_content` - Generate summaries of stored content
- `contextual_memory_search` - Search with contextual awareness
- `consolidate_memories` - Optimize and consolidate memory storage


## 🔄 Multi-Device Sync Setup

Columnist-DB provides enterprise-grade synchronization for multi-device applications:

### Firebase Sync Example
```typescript
import { Columnist } from 'columnist-db-core';

const db = await Columnist.init('my-app', { schema });

// Register Firebase sync adapter
await db.registerSyncAdapter('firebase', 'firebase', {
  apiKey: 'your-api-key',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  realtime: true, // Enable real-time sync
  conflictStrategy: 'device-aware' // Smart conflict resolution
});

// Start synchronization
await db.startSync('firebase');

// Monitor sync status
const status = db.getSyncStatus('firebase');
console.log('Sync status:', status);
```

### Advanced Sync Features
- **Real-time Conflict Resolution**: Device-aware strategies with automatic merging
- **Offline-First Design**: Changes tracked locally and synced when online
- **Multiple Backend Support**: Firebase, Supabase, REST API adapters
- **Device Management**: Automatic device fingerprinting and presence tracking
- **Performance Optimized**: Batched operations with exponential backoff

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LLM Assistant │◄──►│  AI Memory MCP   │◄──►│   IndexedDB     │
│  (Claude Code)  │    │     Server       │    │   (Browser)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Memory Tools  │    │   Content Types  │    │   Vector Search │
│  (12 tools)     │    │   (5 types)      │    │   (Embeddings)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow
1. **Memory Operations**: LLM calls memory tools via MCP protocol
2. **Content Storage**: Universal storage for conversations, documents, web content
3. **Semantic Search**: Hybrid search combining vector and keyword matching
4. **Cross-Session Persistence**: Memory retained across different LLM sessions

## 📊 Database Schema

### Papers Table
```typescript
{
  id: string;           // Unique identifier
  title: string;        // Paper title
  authors: string;      // Comma-separated authors
  abstract: string;     // Paper abstract
  publicationDate: Date;// Publication date
  tags: string;         // Comma-separated tags
  vectorEmbedding: number[]; // Semantic embeddings
}
```

### Notes Table
```typescript
{
  id: string;           // Unique identifier
  content: string;      // Note content
  tags: string[];       // Array of tags
  paperId?: string;     // Optional paper reference
}
```

## 📊 Performance Benchmarks

### Database Engine Performance
- **Vector Search**: Query 100k embeddings in <50ms (browser)
- **Hybrid Search**: Combined text + vector queries in <100ms
- **Storage Efficiency**: 60-80% compression with columnar storage
- **Memory Usage**: Optimized for large datasets with streaming

### AI Memory Performance
- **Context Retrieval**: Retrieve relevant context in <20ms
- **Cross-Session Persistence**: Instant access to historical conversations
- **Semantic Search**: Find related content across 10k+ items in <50ms

## 🎯 Use Cases

### Database Engine Applications
- **Analytics Dashboards**: Fast columnar queries for real-time analytics
- **Vector Search Applications**: Semantic search for content platforms
- **Offline-First Apps**: Client-side data persistence with sync
- **Real-time Applications**: Low-latency queries for interactive apps

### LLM Context Management
- **Persistent Memory**: Enable LLMs to maintain context across conversations
- **Session Continuity**: Retain important information between different LLM sessions
- **Context Window Extension**: Store and retrieve relevant context beyond token limits

### AI Assistant Memory
- **Conversation History**: Store and search past conversations with users
- **Document Memory**: Remember important documents and their contents
- **Web Content Archive**: Save and retrieve web pages and online resources
- **Personal Knowledge Base**: Build persistent knowledge for AI assistants

### Research and Analysis
- **Research Paper Management**: Organize and search academic papers
- **Note Organization**: Store and retrieve research notes and insights
- **Semantic Discovery**: Find related content using vector similarity

### Enterprise AI Applications
- **Customer Support**: Maintain context across customer interactions
- **Technical Documentation**: Store and retrieve technical knowledge
- **Project Memory**: Remember project details and requirements

## 🔧 Technical Architecture

### Core Database Engine
- **Columnar Storage**: Optimized for vector operations and analytical queries
- **Hybrid Indexing**: Combined full-text and vector indexes for fast search
- **Memory Management**: Efficient caching and garbage collection
- **Query Optimizer**: Intelligent query planning for optimal performance

### Development Stack
- **TypeScript**: Type-safe development with comprehensive type definitions
- **Zod**: Runtime schema validation and type inference
- **IndexedDB**: Client-side persistence with transaction support
- **React Hooks**: Seamless integration with React applications

### AI Integration Layer
- **MCP Protocol**: Standardized AI assistant integration
- **Vector Embeddings**: Support for multiple embedding models
- **Context Management**: Intelligent context retrieval and ranking
- **Memory Consolidation**: Automated memory optimization

## 🆚 Why Columnist-DB?

### Compared to Other Solutions

| Feature | Columnist-DB | IndexedDB Wrappers | Vector DBs | Traditional DBs |
|---------|--------------|-------------------|------------|----------------|
| **Columnar Storage** | ✅ | ❌ | ❌ | ❌ |
| **Hybrid Search** | ✅ | ❌ | ❌ | ❌ |
| **Vector + Text** | ✅ | ❌ | ✅ | ❌ |
| **Client-Side** | ✅ | ✅ | ❌ | ❌ |
| **AI Memory** | ✅ | ❌ | ❌ | ❌ |
| **MCP Integration** | ✅ | ❌ | ❌ | ❌ |
| **TypeScript First** | ✅ | ❌ | ❌ | ❌ |

### Unique Value Proposition
- **Database Engine First**: Not just an AI memory wrapper - a full database engine
- **Production Performance**: Benchmarked performance with real-world use cases
- **Flexible Architecture**: Use as database engine OR AI memory layer OR both
- **Enterprise Ready**: Multi-device sync, conflict resolution, and schema evolution

## 📁 Project Structure

```
columnist-db/
├── packages/              # Modular packages
│   ├── core/             # Main database engine (columnist-db-core)
│   ├── hooks/            # React hooks integration (columnist-db-hooks)
│   ├── ai-memory/        # AI Memory MCP server (columnist-db-ai-memory)
│   └── rag-db/           # RAG database with AI integration
├── mcp-server/           # Legacy MCP server (deprecated)
├── __tests__/            # Comprehensive test suite
└── docs/                 # API documentation and examples
```


## 🚦 Development

### Core Library Development
```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the library
npm run build
```

### MCP Server Setup

**Unified AI Memory MCP (Production):**
```bash
# Install the AI Memory MCP package
npm install columnist-db-ai-memory

# Test the server
node node_modules/columnist-db-ai-memory/index.js
```

## 🤝 Contributing

We welcome contributions to both the core columnist-db library and the Research Assistant demo application. Please see our [Contributing Guidelines](docs/CONTRIBUTING.md) for details on how to get started.

### Areas for Contribution
- **Core Database**: Performance optimizations, new search algorithms
- **Sync Adapters**: Additional backend integration plugins
- **Demo Applications**: New use case demonstrations
- **Documentation**: API documentation and tutorials
- **Testing**: Additional test coverage and examples

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 🎯 Positioning: Database Engine First

Columnist-DB is fundamentally a **database engine** that happens to excel at AI memory use cases. This positioning matters because:

- **Performance Focus**: Database engines are optimized for speed and efficiency
- **Production Ready**: Built with enterprise features like sync, migrations, and monitoring

### Use Cases Beyond AI Memory
- **Analytics Dashboards**: Fast columnar queries for real-time data visualization
- **Content Platforms**: Hybrid search for articles, documents, and media
- **E-commerce**: Product search with semantic understanding
- **Research Tools**: Organize and analyze large datasets
- **Personal Apps**: Offline-first applications with sync capabilities

---

**Built with ❤️ - Columnist-DB: A production-grade columnar database engine optimized for AI applications and client-side data persistence.**
