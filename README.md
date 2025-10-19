# Columnist-DB

A client-side columnar + vector database for AI-native applications.
Hybrid search (full-text + embeddings) that runs entirely in your browser or edge runtime.

## Overview

Columnist-DB is a TypeScript-first database engine designed for applications that need fast, local, persistent, and intelligent search.
It combines the performance of columnar storage with hybrid query capabilities — letting you run full-text, vector, and structured queries in a single engine.

Unlike traditional databases or hosted vector stores, Columnist-DB runs entirely client-side using IndexedDB or in-memory storage.
It's built for local-first, offline-capable, and privacy-preserving AI applications.

## Features

- **Columnar storage** for efficient analytical and vector operations
- **Hybrid search**: combine full-text and vector similarity in one query
- **Schema-based**: define and migrate collections with type safety
- **Zod validation**: runtime schema validation with custom validators
- **Device sync**: multi-device synchronization with Firebase, Supabase, and REST adapters
- **Persistent**: stores data locally via IndexedDB (browser) or file (Node)
- **Offline-first**: works without network access
- **AI memory ready**: optimized for embeddings and LLM context retrieval
- **TypeScript-native**: strong typing, autocomplete, and schema inference
- **Fast**: benchmarked on 100k+ embeddings with <50ms average query latency
- **RAG integration**: document processing with automatic chunking and embedding generation
- **React hooks**: specialized hooks for document management and search workflows

## Installation

```bash
npm install columnist-db-core
```

For React or modern frontends:

```bash
npm install columnist-db-hooks
```

## Quick Start

```typescript
import { Columnist } from "columnist-db-core";

const schema = {
  memories: {
    id: { type: "string", primaryKey: true },
    content: "string",
    contentType: "string",
    embeddings: "vector",
    tags: "string[]",
    createdAt: "date",
  },
};

const db = await Columnist.init("my-app", { schema });

await db.insert("memories", {
  id: "1",
  content: "Building a local-first AI assistant",
  contentType: "note",
  embeddings: [0.1, 0.2, 0.3],
  tags: ["ai", "memory"],
  createdAt: new Date(),
});

const results = await db.search("memories", {
  query: "AI assistant",
  vector: [0.1, 0.2, 0.25],
  similarityThreshold: 0.7,
});

console.log(results);
```

## Document Processing (RAG Integration)

Columnist-DB includes built-in document processing for RAG workflows:

```typescript
import { MemoryManager, BasicEmbeddingProvider } from "columnist-db-core";

// Initialize memory manager
const memoryManager = new MemoryManager(db);
await memoryManager.initialize();

// Register embedding provider
const basicProvider = new BasicEmbeddingProvider();
memoryManager.registerEmbeddingProvider(basicProvider);

// Add document with automatic chunking
const documentId = await memoryManager.addDocument(
  "Your long document content here...",
  { category: "research", tags: ["ai", "ml"] },
  {
    chunkingStrategy: "semantic", // semantic, fixed, or recursive
    maxChunkSize: 500,
    generateEmbeddings: true
  }
);

// Search documents with hybrid search
const results = await memoryManager.searchDocuments("machine learning", {
  searchStrategy: "hybrid", // hybrid, semantic, or keyword
  similarityThreshold: 0.7,
  includeHighlights: true
});
```

## Advanced Features

### Zod Schema Validation

```typescript
import { z } from "zod";

// Define custom validation schema
const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(0).max(150),
  preferences: z.object({
    theme: z.enum(["light", "dark", "auto"]),
    notifications: z.boolean()
  })
});

const schema = {
  users: {
    id: { type: "string", primaryKey: true },
    name: "string",
    email: "string",
    age: "number",
    preferences: "json",
    validation: userSchema // Custom Zod validation
  }
};

const db = await Columnist.init("my-app", { schema });

// Data will be validated against Zod schema
await db.insert("users", {
  id: "user_1",
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  preferences: { theme: "dark", notifications: true }
});
```

### Device Synchronization

```typescript
import { SyncManager, FirebaseSyncAdapter } from "columnist-db-core";

// Initialize sync manager
const syncManager = new SyncManager(db);
await syncManager.initialize();

// Register Firebase sync adapter
const firebaseAdapter = new FirebaseSyncAdapter(db, {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  realtime: true, // Enable real-time sync
  conflictStrategy: "device-aware" // Smart conflict resolution
});

syncManager.registerAdapter("firebase", firebaseAdapter);

// Start synchronization
await syncManager.startAll();

// Monitor sync status
const status = syncManager.getAdapter("firebase")?.getStatus();
console.log("Sync status:", status);
```

## React Hooks

```typescript
import { useColumnist, useDocumentSearch } from "columnist-db-hooks";

function DocumentApp() {
  // Main database hook
  const { db, isLoading, error } = useColumnist({
    name: "my-app",
    schema: {
      documents: {
        id: "string",
        content: "string",
        embeddings: "vector"
      }
    }
  });

  // Specialized document search hook
  const {
    results,
    search,
    hasResults
  } = useDocumentSearch({
    memoryManager: memoryManager,
    debounceMs: 300,
    autoSearch: true
  });

  return (
    <div>
      {hasResults && results.map(result => (
        <div key={result.memory.id}>
          {result.memory.content.slice(0, 100)}...
        </div>
      ))}
    </div>
  );
}
```

## Example Use Cases

- **AI memory layers** (semantic recall for assistants)
- **Offline-first note-taking** or research tools
- **Client-side knowledge bases** with hybrid search
- **LLM-powered browsers** or edge apps
- **Semantic analytics dashboards**
- **RAG applications** with local document processing
- **Personal AI assistants** with persistent memory
- **Multi-device sync** for collaborative applications
- **Form validation** with runtime schema enforcement
- **Enterprise apps** with offline capabilities

## Performance

Columnist-DB uses a columnar layout internally for efficient scanning and vector operations.
On typical hardware:

- 100k+ records queried in under 50ms (browser)
- IndexedDB persistence with lazy loading
- Vector fields support up to 1536 dimensions
- Document processing with automatic chunking

## Roadmap

- Vector index compression
- WASM-accelerated similarity search
- Query planner improvements
- Additional sync adapters (AWS, Google Cloud, etc.)
- Advanced vector index types (HNSW, IVFPQ)
- Real-time collaborative editing

## License

MIT License © 2025 codeisdemode