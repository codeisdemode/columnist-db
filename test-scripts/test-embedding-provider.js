// Test Embedding Provider Integration

console.log('🧪 Testing Embedding Provider Integration...\n');

async function testEmbeddingProvider() {
  try {
    // Import the Memory Manager and BasicEmbeddingProvider
    const { MemoryManager, BasicEmbeddingProvider } = await import('./packages/core/dist/memory/index.js');

    console.log('1. Creating Memory Manager...');
    const memoryManager = new MemoryManager(null);

    console.log('2. Testing without embedding provider...');
    console.log('   - Has embedding provider:', memoryManager.hasEmbeddingProvider());
    console.log('   - Provider info:', memoryManager.getEmbeddingProviderInfo());

    console.log('3. Registering BasicEmbeddingProvider...');
    const basicProvider = new BasicEmbeddingProvider();
    memoryManager.registerEmbeddingProvider(basicProvider);

    console.log('4. Testing with embedding provider...');
    console.log('   - Has embedding provider:', memoryManager.hasEmbeddingProvider());
    console.log('   - Provider info:', memoryManager.getEmbeddingProviderInfo());

    console.log('5. Testing document processing with embedding provider...');
    const documentId = await memoryManager.addDocument(
      'This is a test document for embedding provider testing. It contains multiple sentences to test the chunking and embedding functionality.',
      { category: 'test', tags: ['embedding', 'test'] },
      { chunkingStrategy: 'semantic', generateEmbeddings: true }
    );

    console.log('   - Document added with ID:', documentId);

    console.log('6. Testing search with embedding provider...');
    const searchResults = await memoryManager.searchDocuments('test document', {
      searchStrategy: 'hybrid',
      includeHighlights: true
    });

    console.log('   - Search results count:', searchResults.length);

    console.log('7. Testing unregistering embedding provider...');
    memoryManager.unregisterEmbeddingProvider();
    console.log('   - Has embedding provider after unregister:', memoryManager.hasEmbeddingProvider());

    console.log('\n✅ Embedding Provider Integration Test Completed Successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEmbeddingProvider();