# ColumnistDB RAG Platform - Developer Documentation

## 📖 Table of Contents

1. [Quick Start](#quick-start)
2. [API Reference](#api-reference)
3. [Configuration](#configuration)
4. [React Integration](#react-integration)
5. [Advanced Features](#advanced-features)
6. [Performance Optimization](#performance-optimization)
7. [Troubleshooting](#troubleshooting)
8. [Examples](#examples)

## 🚀 Quick Start

### Installation

```bash
# Install the main package
npm install columnist-db-rag

# Or install individual packages
npm install columnist-db-core
npm install columnist-db-hooks
npm install columnist-db-plugin-openai-embedding
```

### Basic Usage

```typescript
import { RAGDatabase } from 'columnist-db-rag';

// Initialize with default settings
const ragDb = new RAGDatabase();

// Add documents
const docId = await ragDb.addDocument(
  'Machine learning is a subset of artificial intelligence.',
  { category: 'ai', source: 'wikipedia' }
);

// Search with hybrid capabilities
const results = await ragDb.search('artificial intelligence', {
  limit: 10,
  threshold: 0.5
});

// Get statistics
const stats = await ragDb.getStats();
console.log(`Total documents: ${stats.totalDocuments}`);
```

## 📚 API Reference

### RAGDatabase Class

#### Constructor

```typescript
new RAGDatabase(options?: Partial<RAGDatabaseOptions>)
```

**Options:**
- `name`: Database name (default: 'rag-db')
- `embeddingModel`: Embedding model to use (default: 'auto')
- `chunkingStrategy`: Chunking strategy (default: 'semantic')
- `searchStrategy`: Search strategy (default: 'hybrid')
- `apiKey`: OpenAI API key (optional)
- `syncEnabled`: Enable synchronization (default: false)
- `syncAdapter`: Sync adapter type ('firebase', 'supabase', 'rest')
- `syncConfig`: Sync configuration object

#### Methods

##### `addDocument(content: string, metadata?: Record<string, any>): Promise<string>`

Adds a document to the database.

```typescript
const docId = await ragDb.addDocument('Content here', {
  category: 'tech',
  author: 'John Doe',
  timestamp: new Date()
});
```

##### `search(query: string, options?: SearchOptions): Promise<SearchResult[]>`

Searches for documents matching the query.

```typescript
const results = await ragDb.search('machine learning', {
  limit: 5,
  threshold: 0.7,
  includeHighlights: true,
  filters: { category: 'ai' }
});
```

**SearchOptions:**
- `limit`: Maximum number of results (default: 10)
- `threshold`: Minimum similarity score (default: 0.5)
- `includeHighlights`: Include highlight terms (default: false)
- `filters`: Metadata filters for results

##### `getStats(): Promise<RAGStats>`

Returns database statistics.

```typescript
const stats = await ragDb.getStats();
// {
//   totalDocuments: 42,
//   totalChunks: 156,
//   embeddingModel: 'text-embedding-3-small',
//   searchPerformance: { ... }
// }
```

##### `clear(): Promise<void>`

Clears all documents from the database.

```typescript
await ragDb.clear();
```

## ⚙️ Configuration

### Embedding Models

Supported models:
- `'auto'`: Automatically selects the best model
- `'text-embedding-3-small'`: Small, fast model
- `'text-embedding-3-large'`: Large, high-quality model
- `'text-embedding-ada-002'`: Legacy model

### Chunking Strategies

#### Semantic Chunking
```typescript
const ragDb = new RAGDatabase({
  chunkingStrategy: 'semantic'
});
```
- Splits by paragraphs and sentences
- Maintains semantic coherence
- Ideal for most use cases

#### Fixed Size Chunking
```typescript
const ragDb = new RAGDatabase({
  chunkingStrategy: 'fixed'
});
```
- Fixed character length chunks
- Configurable chunk size
- Good for consistent processing

#### Recursive Chunking
```typescript
const ragDb = new RAGDatabase({
  chunkingStrategy: 'recursive'
});
```
- Hierarchical chunking
- Optimal for nested content
- Best for complex documents

### Search Strategies

#### Hybrid Search (Recommended)
```typescript
const ragDb = new RAGDatabase({
  searchStrategy: 'hybrid'
});
```
- Combines semantic and keyword search
- Best overall performance
- Default strategy

#### Semantic Search
```typescript
const ragDb = new RAGDatabase({
  searchStrategy: 'semantic'
});
```
- Pure vector similarity
- Best for semantic understanding
- Requires embeddings

#### Keyword Search
```typescript
const ragDb = new RAGDatabase({
  searchStrategy: 'keyword'
});
```
- Traditional TF-IDF search
- Fast and efficient
- Good for exact matches

## ⚛️ React Integration

### useRAGDatabase Hook

```tsx
import { useRAGDatabase } from 'columnist-db-rag/hooks';

function SearchComponent() {
  const {
    addDocument,
    searchDocuments,
    stats,
    isLoading,
    error
  } = useRAGDatabase({
    name: 'my-app',
    embeddingModel: 'auto'
  });

  const handleSearch = async (query: string) => {
    const results = await searchDocuments(query);
    // Handle results
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <SearchInput onSearch={handleSearch} />
      <div>Documents: {stats.totalDocuments}</div>
    </div>
  );
}
```

### useColumnist Hook (Advanced)

For direct database access:

```tsx
import { useColumnist } from 'columnist-db-hooks';

function DatabaseComponent() {
  const { db, insert, search, isLoading } = useColumnist({
    name: 'my-db',
    schema: {
      documents: {
        columns: {
          id: 'string',
          content: 'text',
          metadata: 'json'
        }
      }
    }
  });

  // Use database methods directly
}
```

## 🚀 Advanced Features

### Custom Embedding Providers

Create your own embedding provider:

```typescript
import { BaseEmbeddingProvider } from 'columnist-db-rag';

class CustomEmbeddingProvider extends BaseEmbeddingProvider {
  async generateEmbedding(text: string): Promise<Float32Array> {
    // Your embedding logic here
    return new Float32Array(1536); // Return embedding vector
  }

  getModel(): string {
    return 'custom-model';
  }
}

const ragDb = new RAGDatabase({
  embeddingProvider: new CustomEmbeddingProvider()
});
```

### Sync Configuration

Enable real-time synchronization:

```typescript
const ragDb = new RAGDatabase({
  syncEnabled: true,
  syncAdapter: 'firebase',
  syncConfig: {
    apiKey: 'your-firebase-key',
    projectId: 'your-project-id',
    collection: 'documents'
  }
});
```

### Metadata Filtering

Filter search results by metadata:

```typescript
const results = await ragDb.search('query', {
  filters: {
    category: 'technical',
    language: 'english',
    date: { $gte: new Date('2024-01-01') }
  }
});
```

## ⚡ Performance Optimization

### Batch Operations

Process multiple documents efficiently:

```typescript
// Add multiple documents
const documents = [
  { content: 'doc1', metadata: {} },
  { content: 'doc2', metadata: {} },
  // ... more documents
];

for (const doc of documents) {
  await ragDb.addDocument(doc.content, doc.metadata);
}
```

### Memory Management

For large datasets, consider:

```typescript
// Clear old data periodically
await ragDb.clear();

// Or implement custom cleanup
const stats = await ragDb.getStats();
if (stats.totalDocuments > 10000) {
  console.log('Consider archiving old data');
}
```

### Search Optimization

```typescript
// Use appropriate search strategy
const ragDb = new RAGDatabase({
  searchStrategy: 'keyword' // Faster for exact matches
});

// Adjust threshold for precision/recall
const results = await ragDb.search('query', {
  threshold: 0.8 // Higher for precision, lower for recall
});
```

## 🔧 Troubleshooting

### Common Issues

#### "IndexedDB not available"

**Solution:** Ensure you're in a browser environment or use fake-indexeddb for testing:

```bash
npm install --save-dev fake-indexeddb
```

```typescript
import 'fake-indexeddb/auto';
```

#### "Cannot find module"

**Solution:** Check your import paths:

```typescript
// Correct
import { RAGDatabase } from 'columnist-db-rag';
import { useRAGDatabase } from 'columnist-db-rag/hooks';

// Incorrect
import { RAGDatabase } from 'columnist-db';
```

#### Slow Search Performance

**Solutions:**
- Reduce the number of documents
- Use keyword search for exact matches
- Increase search threshold
- Implement caching

### Debug Mode

Enable debug logging:

```typescript
const ragDb = new RAGDatabase({
  // Add debug configuration if available
});

// Or use browser dev tools
console.log('Database stats:', await ragDb.getStats());
```

## 📋 Examples

### Basic Search Application

```tsx
import React, { useState } from 'react';
import { useRAGDatabase } from 'columnist-db-rag/hooks';

export function SearchApp() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const { searchDocuments, addDocument } = useRAGDatabase();

  const handleSearch = async () => {
    const searchResults = await searchDocuments(query);
    setResults(searchResults);
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search documents..."
      />
      <button onClick={handleSearch}>Search</button>

      {results.map((result, index) => (
        <div key={index}>
          <h3>Result {index + 1}</h3>
          <p>{result.document.content}</p>
          <small>Score: {result.score}</small>
        </div>
      ))}
    </div>
  );
}
```

### Document Management System

```typescript
class DocumentManager {
  private ragDb: RAGDatabase;

  constructor() {
    this.ragDb = new RAGDatabase({
      name: 'document-manager',
      syncEnabled: true
    });
  }

  async addDocument(content: string, metadata: any) {
    return await this.ragDb.addDocument(content, metadata);
  }

  async searchDocuments(query: string, filters?: any) {
    return await this.ragDb.search(query, { filters });
  }

  async getDocumentStats() {
    return await this.ragDb.getStats();
  }
}
```

## 📞 Support

### Getting Help

- **Documentation**: Check this guide first
- **GitHub Issues**: [Report bugs](https://github.com/columnist-db/issues)
- **Discord**: [Join community](https://discord.gg/columnist-db)
- **Email**: support@columnist-db.com

### Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

---

**Need more help?** Check out our [examples repository](https://github.com/columnist-db/examples) for complete working applications.