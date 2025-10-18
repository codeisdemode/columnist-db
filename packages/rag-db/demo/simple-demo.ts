import { RAGDatabase } from '../src';
import 'fake-indexeddb/auto';

async function runDemo() {
  console.log('🚀 Starting ColumnistDB RAG Demo...\n');

  // Initialize RAG database
  const ragDb = new RAGDatabase({
    name: 'demo-rag-db',
    embeddingModel: 'auto',
    chunkingStrategy: 'semantic',
    searchStrategy: 'hybrid'
  });

  console.log('📚 Adding sample documents...');

  // Add sample documents
  const documents = [
    {
      content: "Artificial intelligence is transforming how we interact with technology. Machine learning algorithms can now understand natural language and generate human-like text.",
      metadata: { category: 'ai', source: 'tech-blog' }
    },
    {
      content: "React is a popular JavaScript library for building user interfaces. It uses a virtual DOM for efficient rendering and has a large ecosystem of tools and libraries.",
      metadata: { category: 'web-dev', source: 'framework-docs' }
    },
    {
      content: "TypeScript adds static typing to JavaScript, making it easier to build large-scale applications. It provides better tooling and catches errors at compile time.",
      metadata: { category: 'web-dev', source: 'language-docs' }
    },
    {
      content: "Vector databases store embeddings for semantic search. They enable similarity-based retrieval which is essential for modern AI applications.",
      metadata: { category: 'database', source: 'tech-article' }
    }
  ];

  for (const doc of documents) {
    const docId = await ragDb.addDocument(doc.content, doc.metadata);
    console.log(`✅ Added document: ${doc.content.substring(0, 50)}...`);
  }

  console.log('\n🔍 Testing search capabilities...\n');

  // Test searches
  const testQueries = [
    'machine learning',
    'React components',
    'TypeScript benefits',
    'vector search'
  ];

  for (const query of testQueries) {
    console.log(`🔎 Searching for: "${query}"`);
    const results = await ragDb.search(query, { limit: 3 });

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.document.content.substring(0, 80)}...`);
      console.log(`     Score: ${result.score.toFixed(3)}, Relevance: ${result.relevance}`);
    });
    console.log('');
  }

  // Get statistics
  console.log('📊 Database Statistics:');
  const stats = await ragDb.getStats();
  console.log(`  Total Documents: ${stats.totalDocuments}`);
  console.log(`  Total Chunks: ${stats.totalChunks}`);
  console.log(`  Embedding Model: ${stats.embeddingModel}`);

  console.log('\n🎉 Demo completed successfully!');
}

// Run the demo
runDemo().catch(console.error);