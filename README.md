# Columnist-DB - Client-Side Database for Modern Web Applications

A production-ready client-side database with IndexedDB persistence, full-text search, and AI integration capabilities. Features a comprehensive Research Assistant demo showcasing real-world applications.

## 🚀 Key Features

### Core Database Engine
- **Client-Side Storage**: IndexedDB persistence with offline capabilities
- **Full-Text Search**: TF-IDF based relevance scoring with inverted indexes
- **Vector Search**: Semantic search with embeddings support
- **Schema Validation**: Zod integration for type-safe data operations
- **⚡ Enterprise-Grade Sync**: Multi-device synchronization with real-time conflict resolution

### 🔄 Advanced Sync Capabilities
- **Multi-Device Synchronization**: Real-time sync across devices with device fingerprinting
- **Conflict Resolution**: Smart strategies (local/remote wins, merge, device-aware, custom)
- **Backend Adapters**: Firebase, Supabase, REST API with real-time listeners
- **Offline-First**: Robust change tracking with automatic retry and exponential backoff
- **Device Management**: Presence tracking, capability detection, and online status awareness

### Research Assistant Demo
- **Modern Web App**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Paper Management**: Add, search, and organize research papers
- **Note-Taking System**: Research notes linked to papers
- **AI Integration**: MCP server with 10 research tools for AI assistants
- **Real-time Search**: Instant search with relevance ranking

## 🛠️ Quick Start

### Try the Research Assistant Demo

1. **Clone the repository**
```bash
git clone https://github.com/codeisdemode/columnist-db.git
cd columnist-db/app

2. **Install dependencies and run**
```bash
npm install
npm run dev

3. **Open [http://localhost:3000](http://localhost:3000)** and explore:
   - Add sample papers using the "Add Sample Paper" button
   - Search for papers using the search bar
   - Add notes to papers using "Add Sample Note"
   - Switch between different tabs to explore features

### Component-Based Installation (shadcn/ui style)

Columnist-DB supports modular installation similar to shadcn/ui, allowing you to install only the components you need:

#### Install Core Database Only
```bash
npm install columnist-db-core
```

```typescript
import { ColumnistDB } from 'columnist-db-core';

// Define your schema
const schema = {
  users: {
    id: 'string',
    name: 'string',
    email: 'string'
  }
};

// Initialize database
const db = new ColumnistDB({ schema });

// Use the database
await db.insert('users', { name: 'John', email: 'john@example.com' });
const users = await db.search('users', 'John');
```

#### Install React Hooks Integration
```bash
npm install columnist-db-hooks
```

```typescript
import { useColumnistDB } from 'columnist-db-hooks';

// Use in React components
function MyComponent() {
  const { db, isLoading, error } = useColumnistDB({ schema });
  // ...
}
```

#### Install Full Package (All Components)
```bash
npm install columnist-db
```

```typescript
import { ColumnistDB } from 'columnist-db';
// Includes core + hooks + plugins
```

## 🚀 Features

### Research Assistant Web Application
- **Full-Text Search**: Search research papers by title, abstract, authors, or tags
- **Semantic Search**: Vector embeddings for intelligent content discovery
- **Paper Management**: Add, view, and organize research papers
- **Note-Taking**: Add research notes linked to papers
- **Modern UI**: Built with Next.js 15, React 19, and Tailwind CSS

### MCP Server Integration
- **AI Memory System**: MCP server for AI assistants (Claude Code, ChatGPT)
- **10 Research Tools**: Paper management, search, analysis, and export capabilities
- **Persistent Storage**: Client-side database with IndexedDB persistence
- **Cross-Platform**: Works on desktop and mobile devices

## 📋 Prerequisites

- Node.js 18+
- Modern web browser with IndexedDB support

## 🤖 MCP Server Setup

The MCP server enables AI assistants to use columnist-db as persistent memory:

### For Claude Code
Add to your Claude Code configuration:
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

### Available MCP Tools
- `add_research_paper` - Add new research papers
- `search_papers` - Search with full-text and semantic capabilities
- `get_research_summary` - Get analytics on your research collection
- `export_research_data` - Export to JSON, CSV, or BibTeX

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

┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js App   │◄──►│  columnist-db    │◄──►│   IndexedDB     │
│  (React 19)     │    │     Core         │    │   (Browser)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Server    │◄──►│   AI Assistants  │    │   Vector Search │
│  (Claude Code)  │    │   (ChatGPT)      │    │   (Embeddings)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘

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

### Notes Table
```typescript
{
  id: string;           // Unique identifier
  content: string;      // Note content
  tags: string[];       // Array of tags
  paperId?: string;     // Optional paper reference
}

## 🎯 Use Cases

### Academic Research
- Organize literature reviews
- Track research progress
- Collaborate on papers

### AI Memory Systems
- Persistent context for AI assistants
- Document memory across sessions
- Research paper retrieval for AI analysis

### Personal Knowledge Management
- Build personal research libraries
- Connect notes across papers
- Semantic search for insights

## 🔧 Technical Highlights

- **Next.js 15** with Turbopack for fast development
- **React 19** with latest features and optimizations
- **TypeScript** for type-safe development
- **Tailwind CSS** for modern styling
- **Zod** for schema validation
- **MCP Protocol** for AI integration

## 📁 Project Structure

columnist-db/
├── packages/              # Modular packages (shadcn/ui style)
│   ├── core/             # Main database engine (columnist-db-core)
│   ├── hooks/            # React hooks integration (columnist-db-hooks)
│   └── plugins/          # Sync and embedding plugins
├── src/                  # Research Assistant demo app
│   ├── app/              # Next.js app router pages
│   ├── components/       # UI components
│   ├── docs/             # Documentation pages
│   └── page.tsx          # Main application
├── mcp-server/           # MCP server for AI integration
│   ├── standalone-server.js
│   ├── package.json
│   └── configuration files
├── __tests__/            # Comprehensive test suite
├── docs/                 # API documentation and examples
└── showcase/             # Additional demo applications

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

### MCP Server Setup
```bash
# Navigate to MCP server directory
cd mcp-server

# Install dependencies
npm install

# Test the server
node standalone-server.js

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

**Built with ❤️ - Columnist-DB: The production-ready client-side database for modern web applications with AI integration capabilities.**
