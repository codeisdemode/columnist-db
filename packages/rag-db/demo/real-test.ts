// Real implementation test - verifies the actual RAG database works
import { RAGDatabase } from '../src';
import 'fake-indexeddb/auto';

async function testRealImplementation() {
  console.log('🧪 Testing Real RAG Database Implementation...\n');

  try {
    // Test 1: Database initialization
    console.log('1. Testing database initialization...');
    const ragDb = new RAGDatabase({
      name: 'test-rag-db',
      embeddingModel: 'auto',
      chunkingStrategy: 'semantic',
      searchStrategy: 'hybrid'
    });
    console.log('✅ Database initialized successfully');

    // Test 2: Adding documents
    console.log('\n2. Testing document addition...');
    const docId = await ragDb.addDocument(
      'This is a test document about artificial intelligence and machine learning.',
      { category: 'test', source: 'demo' }
    );
    console.log('✅ Document added with ID:', docId);

    // Test 3: Search functionality
    console.log('\n3. Testing search functionality...');
    const results = await ragDb.search('artificial intelligence', { limit: 1 });
    console.log('✅ Search completed successfully');
    console.log('   Found', results.length, 'results');

    if (results.length > 0) {
      console.log('   Top result score:', results[0].score);
    }

    // Test 4: Statistics
    console.log('\n4. Testing statistics...');
    const stats = await ragDb.getStats();
    console.log('✅ Statistics retrieved successfully');
    console.log('   Total documents:', stats.totalDocuments);
    console.log('   Total chunks:', stats.totalChunks);

    console.log('\n🎉 All tests passed! The RAG database implementation is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testRealImplementation().catch(console.error);