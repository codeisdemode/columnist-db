// Simple CommonJS test for core functionality
const { Columnist } = require('./packages/core/dist/columnist.js');

async function testCoreFunctionality() {
  try {
    console.log('Testing ColumnistDB core functionality...');

    // Initialize database
    const db = await Columnist.init('test-db', {
      schema: {
        test: {
          id: { type: 'string', primaryKey: true },
          name: { type: 'string' },
          value: { type: 'number' }
        }
      }
    });

    console.log('✅ Database initialized successfully');

    // Test insert
    await db.test.insert({
      id: 'test1',
      name: 'Test Record',
      value: 42
    });

    console.log('✅ Insert operation successful');

    // Test query
    const results = await db.test.find({
      where: { name: 'Test Record' }
    });

    console.log('✅ Query operation successful');
    console.log('Results:', results);

    console.log('\n🎉 Core functionality tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCoreFunctionality();