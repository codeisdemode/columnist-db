import { RAGDatabase } from '../src';

// Example usage of the RAG database
async function demonstrateRAG() {
  console.log('🚀 Initializing RAG Database...');

  // Create a RAG database with auto-configuration
  const rag = new RAGDatabase({
    name: 'my-research-db',
    embeddingModel: 'auto',
    chunkingStrategy: 'semantic',
    searchStrategy: 'hybrid',
    apiKey: process.env.OPENAI_API_KEY // Optional - will work without embeddings too
  });

  // Initialize the database
  await rag.initialize();

  console.log('✅ Database initialized');

  // Add some research papers
  console.log('📚 Adding documents...');

  const paper1 = await rag.addDocument(
    `Machine Learning in Healthcare: Applications and Challenges

    This paper explores the application of machine learning algorithms in healthcare diagnostics and treatment planning. We discuss various ML techniques including neural networks, decision trees, and support vector machines.

    Key findings include improved diagnostic accuracy and personalized treatment recommendations. However, challenges remain in data privacy and model interpretability.`,
    {
      title: 'Machine Learning in Healthcare',
      authors: ['John Smith', 'Jane Doe'],
      year: 2024,
      tags: ['machine-learning', 'healthcare', 'ai']
    }
  );

  const paper2 = await rag.addDocument(
    `Natural Language Processing: Recent Advances and Future Directions

    This review covers the latest developments in NLP, focusing on transformer architectures and their applications in various domains. We examine BERT, GPT models, and their impact on language understanding.

    The paper discusses challenges in multilingual processing and ethical considerations in AI language models.`,
    {
      title: 'Natural Language Processing Review',
      authors: ['Alice Johnson', 'Bob Wilson'],
      year: 2024,
      tags: ['nlp', 'transformers', 'ai']
    }
  );

  console.log(`✅ Added documents: ${paper1}, ${paper2}`);

  // Search for relevant information
  console.log('🔍 Searching for "machine learning healthcare applications"...');

  const results = await rag.search('machine learning healthcare applications', {
    limit: 5,
    threshold: 0.3
  });

  console.log(`📊 Found ${results.length} results:`);

  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.document.metadata.title}`);
    console.log(`   Score: ${result.score.toFixed(3)} (${result.relevance})`);
    console.log(`   Preview: ${result.document.content.substring(0, 100)}...`);
    if (result.highlights && result.highlights.length > 0) {
      console.log(`   Highlights: ${result.highlights.join(', ')}`);
    }
  });

  // Get database statistics
  console.log('\n📈 Database Statistics:');
  const stats = await rag.getStats();
  console.log(`   Total Documents: ${stats.totalDocuments}`);
  console.log(`   Total Chunks: ${stats.totalChunks}`);
  console.log(`   Embedding Model: ${stats.embeddingModel}`);

  console.log('\n🎉 RAG Database demonstration complete!');
}

// React hook usage example
function ReactExample() {
  // In a React component:
  // const { db, isLoading, error, addDocument, search } = useRAGDB({
  //   name: 'my-app',
  //   embeddingModel: 'auto'
  // });

  return 'See the async function above for usage example';
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRAG().catch(console.error);
}

export { demonstrateRAG };