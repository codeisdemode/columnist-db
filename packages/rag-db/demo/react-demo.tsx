'use client'

import React, { useState } from 'react'
import { useRAGDatabase } from '../src/hooks/use-rag-db'

export function RAGDemoComponent() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const { addDocument, searchDocuments, stats } = useRAGDatabase({
    name: 'react-demo',
    embeddingModel: 'auto'
  })

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsLoading(true)
    try {
      const searchResults = await searchDocuments(query, { limit: 5 })
      setResults(searchResults)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddSample = async () => {
    const sampleDocs = [
      "React is a JavaScript library for building user interfaces",
      "TypeScript adds static typing to JavaScript development",
      "Next.js is a React framework for production applications",
      "Vector databases enable semantic search capabilities"
    ]

    for (const doc of sampleDocs) {
      await addDocument(doc, { source: 'demo', timestamp: new Date() })
    }

    alert('Sample documents added!')
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>ColumnistDB RAG Demo</h1>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={handleAddSample}
          style={{
            padding: '10px 15px',
            marginRight: '10px',
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Add Sample Documents
        </button>

        <span style={{ fontSize: '14px', color: '#666' }}>
          Documents: {stats?.totalDocuments || 0}, Chunks: {stats?.totalChunks || 0}
        </span>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter search query..."
          style={{
            width: '300px',
            padding: '10px',
            marginRight: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />

        <button
          onClick={handleSearch}
          disabled={isLoading}
          style={{
            padding: '10px 15px',
            backgroundColor: isLoading ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div>
          <h3>Search Results:</h3>
          {results.map((result, index) => (
            <div
              key={result.document.id}
              style={{
                border: '1px solid #eee',
                padding: '15px',
                marginBottom: '10px',
                borderRadius: '4px',
                backgroundColor: '#f9f9f9'
              }}
            >
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                Score: {result.score.toFixed(3)} | Relevance: {result.relevance}
              </div>
              <div>{result.document.content}</div>
              {result.highlights && result.highlights.length > 0 && (
                <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                  Highlights: {result.highlights.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}