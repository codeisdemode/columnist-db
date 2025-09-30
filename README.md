# Columnist-DB - AI Memory Tool for LLM Context Management

A production-ready AI memory system that enables LLMs to manage their own context windows through persistent memory storage. Provides universal content storage, conversation memory, and semantic search capabilities similar to Claude's Memory Tool.

## 🚀 Key Features

### AI Memory Core
- **Universal Content Storage**: Store conversations, documents, web content, notes, and custom data
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

## 🛠️ Quick Start

### Unified AI Memory MCP Server Setup

Columnist-DB provides a unified AI Memory MCP server that enables LLMs to manage their own context windows with comprehensive memory capabilities:

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

### Research Assistant MCP (⚠️ DEPRECATED)
**This MCP server has been deprecated and replaced by the unified AI Memory MCP server.**

All research paper management capabilities are now available in the unified AI Memory MCP server via the `store_research_paper` tool and `search_memory` with `content_type: "research"`.

**Migration:** Use the unified AI Memory MCP server configuration shown above. See `mcp-server/DEPRECATED.md` for migration details.

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

## 🎯 Use Cases

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

## 🔧 Technical Highlights

- **Next.js 15** with Turbopack for fast development
- **React 19** with latest features and optimizations
- **TypeScript** for type-safe development
- **Tailwind CSS** for modern styling
- **Zod** for schema validation
- **MCP Protocol** for AI integration

## 📁 Project Structure

```
columnist-db/
├── packages/              # Modular packages
│   ├── core/             # Main database engine (columnist-db-core)
│   ├── hooks/            # React hooks integration (columnist-db-hooks)
│   ├── ai-memory/        # AI Memory MCP server (columnist-db-ai-memory)
│   └── plugins/          # Sync and embedding plugins
├── src/                  # Research Assistant demo app
│   ├── app/              # Next.js app router pages
│   ├── components/       # UI components
│   ├── docs/             # Documentation pages
│   └── page.tsx          # Main application
├── packages/ai-memory/   # Unified AI Memory MCP (primary)
│   ├── index.js          # Main MCP server implementation
│   ├── unified-server.js # Unified server with all features
│   ├── package.json      # AI Memory MCP package
│   └── README.md         # AI Memory documentation
├── mcp-server/           # Research Assistant MCP (⚠️ DEPRECATED)
│   ├── standalone-server.js
│   ├── DEPRECATED.md     # Migration guide
│   └── package.json
├── __tests__/            # Comprehensive test suite
├── docs/                 # API documentation and examples
└── showcase/             # Additional demo applications
```

### UI Framework

The Research Assistant demo uses **Tailwind CSS** for styling with basic HTML components. The project includes a `components.json` configuration file for potential shadcn/ui integration, but no shadcn/ui components are currently installed or used.

**To enhance the UI with shadcn/ui components (optional):**
```bash
# Install shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input
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

### Research Assistant Demo
```bash
# Navigate to demo directory
cd app

# Install demo dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### MCP Server Setup

**Research Assistant MCP (Showcase):**
```bash
# Navigate to MCP server directory
cd mcp-server

# Install dependencies
npm install

# Test the server
node standalone-server.js
```

**Unified AI Memory MCP (Production):**
```bash
# Install the AI Memory MCP package
npm install columnist-db-ai-memory

# Test the server
node node_modules/columnist-db-ai-memory/index.js
```

## 🤝 Contributing

We welcome contributions to both the core columnist-db library and the Research Assistant demo application. Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on how to get started.

### Areas for Contribution
- **Core Database**: Performance optimizations, new search algorithms
- **Sync Adapters**: Additional backend integration plugins
- **Demo Applications**: New use case demonstrations
- **Documentation**: API documentation and tutorials
- **Testing**: Additional test coverage and examples

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ - Columnist-DB: The AI Memory Tool that enables LLMs to manage their own context windows through persistent memory storage.**
