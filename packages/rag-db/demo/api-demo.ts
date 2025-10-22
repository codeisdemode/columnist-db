import { RAGDatabase } from '../src';

type SampleDocument = {
  content: string;
  metadata: Record<string, string>;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const sampleDocuments: SampleDocument[] = [
  {
    content:
      'Artificial intelligence is transforming how we interact with technology. Machine learning algorithms can now understand natural language, generate human-like text, and reason about complex problems. Successful products combine retrieval augmented generation with local context so assistants can stay fast and private.',
    metadata: {
      category: 'ai',
      source: 'tech-blog',
      title: 'How AI Assistants Stay Fast',
    },
  },
  {
    content:
      'React is a popular JavaScript library for building user interfaces. It uses a declarative component model, the virtual DOM, and hooks for state management. Teams that ship fast rely on reusable component libraries, co-located tests, and structured data fetching.',
    metadata: {
      category: 'web-dev',
      source: 'framework-docs',
      title: 'Modern React Practices',
    },
  },
  {
    content:
      'Vector databases store numerical representations of text, audio, and images. ColumnistDB blends local columnar storage with vector search so applications can run entirely on the client. Hybrid search combines keyword ranking with cosine similarity for precise retrieval.',
    metadata: {
      category: 'databases',
      source: 'product-whitepaper',
      title: 'Building Local-First Vector Search',
    },
  },
];

async function runDemo(): Promise<void> {
  console.log('📚 ColumnistDB RAG Platform — Live API Demonstration');

  const ragDb = new RAGDatabase({
    name: 'demo-rag-db',
    embeddingModel: OPENAI_API_KEY ? 'text-embedding-3-small' : 'auto',
    apiKey: OPENAI_API_KEY,
    cacheDurationMs: 120_000,
    cacheMaxEntries: 10,
  });

  // Start with a clean slate so the output is deterministic.
  await ragDb.clear();

  console.log('\n📄 Loading sample documents into the database...');
  for (const document of sampleDocuments) {
    const documentId = await ragDb.addDocument(document.content, document.metadata);
    const title = document.metadata.title ?? documentId;
    console.log(`  • Stored "${title}" (document id ${documentId})`);
  }

  const queries = ['machine learning', 'React components', 'vector search'];
  for (const query of queries) {
    console.log(`\n🔍 Query: "${query}"`);
    const results = await ragDb.search(query, { limit: 3, includeHighlights: true });

    if (results.length === 0) {
      console.log('  No matches found.');
      continue;
    }

    results.forEach((result, index) => {
      const snippet = result.document.content.replace(/\s+/g, ' ').slice(0, 120);
      const highlights = result.highlights?.slice(0, 5).join(', ');
      const title = result.document.metadata?.title ?? 'Untitled document';
      console.log(`  ${index + 1}. ${title}`);
      console.log(`     Score: ${result.score.toFixed(3)} (${result.relevance})`);
      console.log(`     Snippet: ${snippet}${snippet.length === 120 ? '…' : ''}`);
      if (highlights) {
        console.log(`     Highlights: ${highlights}`);
      }
    });
  }

  console.log('\n♻️  Re-running the first query to demonstrate result caching...');
  const cachedResults = await ragDb.search(queries[0], { limit: 3, includeHighlights: true });
  console.log(`  Retrieved ${cachedResults.length} cached results for "${queries[0]}".`);

  const stats = await ragDb.getStats();
  console.log('\n📊 Database statistics:');
  console.log(`  Documents stored: ${stats.totalDocuments}`);
  console.log(`  Chunks indexed: ${stats.totalChunks}`);
  console.log(`  Embedding model: ${stats.embeddingModel}`);
  console.log(
    `  Avg response time: ${stats.searchPerformance.avgResponseTime.toFixed(2)} ms across ${stats.searchPerformance.totalQueries} queries`
  );
  console.log(
    `  Cache hit rate: ${(stats.searchPerformance.cacheHitRate * 100).toFixed(1)}%`
  );

  console.log('\n🎉 Demo complete! You can edit sample documents or queries to experiment further.');
}

runDemo().catch(error => {
  console.error('❌ RAG API demo failed:', error);
  process.exitCode = 1;
});
