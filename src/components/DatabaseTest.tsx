'use client';

import { useState } from 'react';
import { useResearchDB } from '@/hooks/useResearchDB';

export function DatabaseTest() {
  const { addPaper, addNote, searchPapers, getAllPapers, getAllNotes } = useResearchDB();
  const [testResults, setTestResults] = useState<string[]>([]);

  const logResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runTests = async () => {
    setTestResults([]);
    logResult('Starting database tests...');

    try {
      // Test 1: Add a paper
      logResult('Test 1: Adding sample paper...');
      await addPaper({
        title: 'Machine Learning in Healthcare',
        authors: 'John Smith, Jane Doe',
        abstract: 'This paper explores the application of machine learning algorithms in healthcare diagnostics and treatment planning.',
        publicationDate: new Date('2024-01-15'),
        tags: 'machine-learning, healthcare, ai'
      });
      logResult('✓ Paper added successfully');

      // Test 2: Add a note
      logResult('Test 2: Adding sample note...');
      await addNote({
        content: 'Interesting findings about neural networks in medical imaging.',
        tags: ['neural-networks', 'medical-imaging']
      });
      logResult('✓ Note added successfully');

      // Test 3: Search papers
      logResult('Test 3: Searching for "machine learning"...');
      const searchResults = await searchPapers('machine learning');
      logResult(`✓ Search found ${searchResults.length} results`);

      // Test 4: Get all papers
      logResult('Test 4: Fetching all papers...');
      const papers = await getAllPapers();
      logResult(`✓ Retrieved ${papers.length} papers`);

      // Test 5: Get all notes
      logResult('Test 5: Fetching all notes...');
      const notes = await getAllNotes();
      logResult(`✓ Retrieved ${notes.length} notes`);

      logResult('All tests completed successfully!');

    } catch (error) {
      logResult(`✗ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="font-semibold text-lg mb-4">Database Test Suite</h3>
      <button
        onClick={runTests}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mb-4"
      >
        Run Database Tests
      </button>

      <div className="bg-white p-4 rounded border max-h-64 overflow-y-auto">
        <h4 className="font-medium mb-2">Test Results:</h4>
        {testResults.length === 0 ? (
          <p className="text-gray-500">No tests run yet. Click the button above to run tests.</p>
        ) : (
          <div className="space-y-1">
            {testResults.map((result, index) => (
              <div key={index} className="text-sm font-mono">
                {result}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}