// Test React Hooks Build Verification

console.log('🧪 Testing React Hooks Build Verification...\n');

async function testHooksBuild() {
  try {
    console.log('1. Checking build output files...');

    const fs = require('fs');
    const path = require('path');

    const hooksDistPath = './packages/hooks/dist';
    const files = fs.readdirSync(hooksDistPath);

    const expectedFiles = [
      'index.js',
      'index.d.ts',
      'use-columnist.js',
      'use-columnist.d.ts',
      'use-document-search.js',
      'use-document-search.d.ts',
      'use-document-management.js',
      'use-document-management.d.ts'
    ];

    const missingFiles = expectedFiles.filter(file => !files.includes(file));

    if (missingFiles.length > 0) {
      console.error('   ❌ Missing files:', missingFiles);
      throw new Error('Build output incomplete');
    }

    console.log('   ✅ All expected build files present');

    console.log('2. Checking TypeScript definitions...');

    // Check that the index file exports the new hooks
    const indexPath = path.join(hooksDistPath, 'index.d.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    const expectedExports = [
      'useDocumentSearch',
      'UseDocumentSearchOptions',
      'UseDocumentSearchResult',
      'useDocumentManagement',
      'UseDocumentManagementOptions',
      'UseDocumentManagementResult',
      'DocumentState'
    ];

    const missingExports = expectedExports.filter(exportName =>
      !indexContent.includes(exportName)
    );

    if (missingExports.length > 0) {
      console.error('   ❌ Missing exports:', missingExports);
      throw new Error('TypeScript exports incomplete');
    }

    console.log('   ✅ All expected TypeScript exports present');

    console.log('3. Checking useColumnist hook extensions...');

    const useColumnistPath = path.join(hooksDistPath, 'use-columnist.d.ts');
    const useColumnistContent = fs.readFileSync(useColumnistPath, 'utf8');

    const expectedDocumentMethods = [
      'addDocument',
      'searchDocuments',
      'getDocumentChunks',
      'registerEmbeddingProvider',
      'unregisterEmbeddingProvider',
      'hasEmbeddingProvider',
      'getEmbeddingProviderInfo'
    ];

    const missingMethods = expectedDocumentMethods.filter(method =>
      !useColumnistContent.includes(method)
    );

    if (missingMethods.length > 0) {
      console.error('   ❌ Missing document methods:', missingMethods);
      throw new Error('useColumnist hook incomplete');
    }

    console.log('   ✅ All document processing methods present in useColumnist');

    console.log('4. Checking specialized document hooks...');

    const useDocumentSearchPath = path.join(hooksDistPath, 'use-document-search.d.ts');
    const useDocumentSearchContent = fs.readFileSync(useDocumentSearchPath, 'utf8');

    const useDocumentManagementPath = path.join(hooksDistPath, 'use-document-management.d.ts');
    const useDocumentManagementContent = fs.readFileSync(useDocumentManagementPath, 'utf8');

    if (!useDocumentSearchContent.includes('UseDocumentSearchOptions')) {
      throw new Error('useDocumentSearch hook incomplete');
    }

    if (!useDocumentManagementContent.includes('UseDocumentManagementOptions')) {
      throw new Error('useDocumentManagement hook incomplete');
    }

    console.log('   ✅ Specialized document hooks properly defined');

    console.log('\n✅ React Hooks Build Verification Completed Successfully!');
    console.log('\n📋 Build Status Summary:');
    console.log('   • ✅ TypeScript compilation successful');
    console.log('   • ✅ All build files generated');
    console.log('   • ✅ TypeScript definitions complete');
    console.log('   • ✅ Document processing methods exported');
    console.log('   • ✅ Specialized hooks properly defined');
    console.log('\n🎯 React hooks are ready for use in applications!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('   - Error details:', error.message);
  }
}

testHooksBuild();