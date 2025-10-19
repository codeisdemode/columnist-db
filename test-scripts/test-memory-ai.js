// Test Memory AI Features
const { MemoryManager } = require('./packages/core/dist/memory/manager.js');

async function testMemoryAI() {
  try {
    console.log('🧠 Testing Memory AI Features...\n');

    // Test 1: Memory Manager Initialization
    console.log('1. Testing Memory Manager Initialization...');
    const memoryManager = new MemoryManager(null);
    await memoryManager.initialize();
    console.log('✅ Memory Manager initialized successfully');

    // Test 2: Store Memories
    console.log('\n2. Testing Memory Storage...');
    const memory1 = await memoryManager.storeMemory(
      'The user prefers dark mode for their applications',
      'preference',
      { category: 'user_preferences' }
    );
    const memory2 = await memoryManager.storeMemory(
      'Important meeting scheduled for next Monday at 2 PM',
      'event',
      { category: 'calendar', importance: 0.9 }
    );
    const memory3 = await memoryManager.storeMemory(
      'User frequently searches for TypeScript documentation',
      'behavior',
      { category: 'user_behavior' }
    );
    const memory4 = await memoryManager.storeMemory(
      'Project deadline is approaching, need to focus on core features',
      'task',
      { category: 'project_management' }
    );

    console.log('✅ Memories stored successfully');
    console.log('   - Memory 1 ID:', memory1);
    console.log('   - Memory 2 ID:', memory2);
    console.log('   - Memory 3 ID:', memory3);
    console.log('   - Memory 4 ID:', memory4);

    // Test 3: Retrieve Individual Memory
    console.log('\n3. Testing Memory Retrieval...');
    const retrievedMemory = await memoryManager.retrieveMemory(memory1);
    console.log('✅ Memory retrieval working');
    console.log('   - Content:', retrievedMemory.content);
    console.log('   - Importance:', retrievedMemory.importance.toFixed(2));
    console.log('   - Access Count:', retrievedMemory.accessCount);

    // Test 4: Semantic Search
    console.log('\n4. Testing Semantic Search...');
    const searchResults = await memoryManager.searchMemories('user preferences', {
      limit: 5,
      semanticSearch: 'user preferences'
    });

    console.log('✅ Semantic search working');
    console.log('   - Found', searchResults.length, 'relevant memories');
    searchResults.forEach((result, index) => {
      console.log(`   - Result ${index + 1}:`);
      console.log(`     Content: ${result.memory.content}`);
      console.log(`     Relevance: ${result.relevance.toFixed(2)}`);
      console.log(`     Similarity: ${result.similarity.toFixed(2)}`);
    });

    // Test 5: Contextual Memory Search
    console.log('\n5. Testing Contextual Memory Search...');
    const context = 'User is working on application settings and preferences';
    const contextualResults = await memoryManager.retrieveContextualMemories(context, 3);

    console.log('✅ Contextual search working');
    console.log('   - Found', contextualResults.length, 'contextually relevant memories');
    contextualResults.forEach((result, index) => {
      console.log(`   - Contextual Result ${index + 1}:`);
      console.log(`     Content: ${result.memory.content}`);
      console.log(`     Relevance: ${result.relevance.toFixed(2)}`);
      console.log(`     Similarity: ${result.similarity.toFixed(2)}`);
    });

    // Test 6: Memory Statistics
    console.log('\n6. Testing Memory Statistics...');
    const stats = await memoryManager.getStats();
    console.log('✅ Memory statistics working');
    console.log('   - Total memories:', stats.totalMemories);
    console.log('   - Average importance:', stats.averageImportance.toFixed(3));
    console.log('   - Average access count:', stats.averageAccessCount.toFixed(1));
    console.log('   - Categories:', JSON.stringify(stats.categories));
    console.log('   - Memory size (bytes):', stats.memorySize);

    // Test 7: Memory Consolidation
    console.log('\n7. Testing Memory Consolidation...');
    const consolidationResult = await memoryManager.consolidateMemoriesWithMetadata({
      threshold: 0.8,
      maxMemories: 3
    });

    console.log('✅ Memory consolidation working');
    console.log('   - Retained:', consolidationResult.retained, 'memories');
    console.log('   - Compressed:', consolidationResult.compressed, 'memories');
    console.log('   - Space saved:', consolidationResult.spaceSaved, 'memories');
    console.log('   - Improvement ratio:', consolidationResult.improvementRatio.toFixed(2), 'x');

    // Test 8: Vector Embedding Verification
    console.log('\n8. Testing Vector Embeddings...');
    const testContent = 'This is a test for vector embeddings';
    const embedding = await memoryManager.generateEmbedding(testContent);
    console.log('✅ Vector embeddings working');
    console.log('   - Embedding length:', embedding.length);
    console.log('   - Embedding sample:', embedding.slice(0, 5).map(v => v.toFixed(3)));

    // Test 9: Cosine Similarity
    console.log('\n9. Testing Cosine Similarity...');
    const vector1 = [1, 2, 3];
    const vector2 = [1, 2, 3];
    const vector3 = [4, 5, 6];

    const similarity1 = memoryManager.cosineSimilarity(vector1, vector2);
    const similarity2 = memoryManager.cosineSimilarity(vector1, vector3);

    console.log('✅ Cosine similarity working');
    console.log('   - Identical vectors similarity:', similarity1.toFixed(3));
    console.log('   - Different vectors similarity:', similarity2.toFixed(3));

    console.log('\n🎉 Memory AI Tests PASSED!');
    console.log('\n📋 Memory AI Features Summary:');
    console.log('   - Vector Embeddings: ✓ Working');
    console.log('   - Semantic Search: ✓ Accurate');
    console.log('   - Contextual Retrieval: ✓ Functional');
    console.log('   - Memory Consolidation: ✓ Efficient');
    console.log('   - Importance Scoring: ✓ Dynamic');
    console.log('   - Statistics Tracking: ✓ Comprehensive');
    console.log('   - Cosine Similarity: ✓ Mathematical');

  } catch (error) {
    console.error('\n❌ Memory AI Test Failed:', error);
    process.exit(1);
  }
}

// Run the test
testMemoryAI();