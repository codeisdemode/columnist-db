# ColumnistDB RAG Demo

This demo showcases the core capabilities of the ColumnistDB RAG Platform.

## Demo Components

### 1. Simple Demo (Node.js)

Run the basic demo to see RAG functionality in action:

```bash
cd packages/rag-db/demo
npm install
npm run demo
```

This demo:
- Initializes a RAG database
- Adds sample documents
- Performs various searches
- Displays search results and statistics

### 2. React Demo

The React component demonstrates integration with React applications:

```tsx
import { RAGDemoComponent } from './demo/react-demo'

function App() {
  return <RAGDemoComponent />
}
```

## Features Demonstrated

- **Hybrid Search**: Combines semantic and keyword search
- **Semantic Chunking**: Intelligent document chunking
- **Relevance Scoring**: Multi-factor relevance calculation
- **React Integration**: Seamless React hook usage
- **Statistics**: Real-time database metrics

## Quick Start

1. Build the packages:
```bash
cd packages/rag-db
npm run build
```

2. Run the demo:
```bash
cd demo
npm install
npm run demo
```

## Sample Output

```
🚀 Starting ColumnistDB RAG Demo...

📚 Adding sample documents...
✅ Added document: Artificial intelligence is transforming how we...
✅ Added document: React is a popular JavaScript library for bui...
✅ Added document: TypeScript adds static typing to JavaScript, ...
✅ Added document: Vector databases store embeddings for semanti...

🔍 Testing search capabilities...

🔎 Searching for: "machine learning"
  1. Artificial intelligence is transforming how we interact with technology. Machine learning...
     Score: 0.856, Relevance: high

🔎 Searching for: "React components"
  1. React is a popular JavaScript library for building user interfaces. It uses a virtual...
     Score: 0.723, Relevance: high

📊 Database Statistics:
  Total Documents: 4
  Total Chunks: 8
  Embedding Model: text-embedding-3-small

🎉 Demo completed successfully!
```