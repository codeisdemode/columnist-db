'use client';

// Research Assistant Application
import { useState, useEffect } from 'react';
import { useResearchDB } from '@/hooks/useResearchDB';
import { Paper, Note } from '@/lib/database';
import { DatabaseTest } from '@/components/DatabaseTest';

export default function ResearchAssistant() {
  const {
    isLoading,
    error,
    addPaper,
    addNote,
    searchPapers,
    getAllPapers,
    getAllNotes,
    getNotesForPaper,
    deletePaper
  } = useResearchDB();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [activeTab, setActiveTab] = useState<'papers' | 'notes' | 'search'>('papers');

  // Load papers and notes on component mount
  const loadData = async () => {
    try {
      const [loadedPapers, loadedNotes] = await Promise.all([
        getAllPapers(),
        getAllNotes()
      ]);
      setPapers(loadedPapers);
      setNotes(loadedNotes);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      console.log('Starting search for:', searchQuery);
      const results = await searchPapers(searchQuery);
      console.log('Search completed, results:', results);
      setSearchResults(results);
      setActiveTab('search');
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  // Add sample paper for testing
  const addSamplePaper = async () => {
    try {
      await addPaper({
        title: 'Machine Learning in Healthcare',
        authors: 'John Smith, Jane Doe', // Now a string instead of array
        abstract: 'This paper explores the application of machine learning algorithms in healthcare diagnostics and treatment planning.',
        publicationDate: new Date('2024-01-15'),
        tags: 'machine-learning, healthcare, ai' // Now a string instead of array
      });
      await loadData();
    } catch (err) {
      console.error('Failed to add sample paper:', err);
    }
  };

  // Add sample note
  const addSampleNote = async () => {
    try {
      await addNote({
        content: 'Interesting findings about neural networks in medical imaging.',
        tags: ['neural-networks', 'medical-imaging'],
        paperId: papers[0]?.id
      });
      await loadData();
    } catch (err) {
      console.error('Failed to add sample note:', err);
    }
  };

  useEffect(() => {
    if (!isLoading && !error) {
      loadData();
    }
  }, [isLoading, error]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing database...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-semibold">Database Error</h2>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Research Assistant</h1>
          <p className="text-gray-600">Organize and search your research papers with AI-powered semantic search</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search papers by title, abstract, or concepts..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Search
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('papers')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'papers'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Papers ({papers.length})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'notes'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Notes ({notes.length})
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'search'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Search Results ({searchResults.length})
            </button>
          </div>
        </div>

        {/* Demo Controls */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Demo Controls</h3>
          <div className="flex gap-4">
            <button
              onClick={addSamplePaper}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Sample Paper
            </button>
            <button
              onClick={addSampleNote}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Sample Note
            </button>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Refresh Data
            </button>
          </div>
        </div>

        {/* Database Test */}
        <div className="mb-6">
          <DatabaseTest />
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-lg shadow-sm border">
          {activeTab === 'papers' && (
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Research Papers</h2>
              {papers.length === 0 ? (
                <p className="text-gray-500">No papers yet. Add some sample data to get started.</p>
              ) : (
                <div className="space-y-4">
                  {papers.map((paper) => (
                    <div key={paper.id} className="p-4 border rounded-lg hover:bg-gray-50">
                      <h3 className="font-semibold text-lg">{paper.title}</h3>
                      <p className="text-gray-600 text-sm">By {paper.authors}</p>
                      <p className="text-gray-700 mt-2">{paper.abstract.substring(0, 200)}...</p>
                      <div className="flex gap-2 mt-2">
                        {paper.tags.split(', ').map(tag => (
                          <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Research Notes</h2>
              {notes.length === 0 ? (
                <p className="text-gray-500">No notes yet.</p>
              ) : (
                <div className="space-y-4">
                  {notes.map((note) => (
                    <div key={note.id} className="p-4 border rounded-lg hover:bg-gray-50">
                      <p className="text-gray-700">{note.content}</p>
                      <div className="flex gap-2 mt-2">
                        {note.tags.map(tag => (
                          <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                Search Results for "{searchQuery}"
              </h2>
              {searchResults.length === 0 ? (
                <p className="text-gray-500">No results found. Try a different search term.</p>
              ) : (
                <div className="space-y-4">
                  {searchResults.map((paper) => (
                    <div key={paper.id} className="p-4 border rounded-lg hover:bg-gray-50">
                      <h3 className="font-semibold text-lg">{paper.title}</h3>
                      <p className="text-gray-600 text-sm">By {paper.authors}</p>
                      <p className="text-gray-700 mt-2">{paper.abstract.substring(0, 200)}...</p>
                      <div className="flex gap-2 mt-2">
                        {paper.tags.split(', ').map(tag => (
                          <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}