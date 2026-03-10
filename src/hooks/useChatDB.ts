'use client';

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getResearchDB } from '@/lib/database';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Array<{ content: string; similarity: number }>;
}

export interface SearchDocumentResult {
  content: string;
  similarity: number;
}

export interface DocumentMetadata {
  filename?: string;
  type?: string;
  size?: number;
  uploadedAt?: string;
}

export interface Document {
  id: string;
  content: string;
  metadata?: DocumentMetadata;
}

type ResearchDB = Awaited<ReturnType<typeof getResearchDB>>;

export function useChatDB() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<ResearchDB | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

  // Initialize database
  useEffect(() => {
    const initializeDB = async () => {
      try {
        if (typeof window === 'undefined') {
          setIsLoading(false);
          return;
        }

        const database = await getResearchDB();
        setDb(database);
        setIsLoading(false);
      } catch (err) {
        console.error('Database initialization failed:', err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to initialize database');
        }
        setIsLoading(false);
      }
    };

    initializeDB();
  }, []);

  const addDocumentToDB = useCallback(async (content: string, metadata?: DocumentMetadata) => {
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      // Create a "paper" document for our knowledge base with all required fields
      const paperData = {
        id: crypto.randomUUID(),
        title: metadata?.filename || 'Document',
        authors: 'User',
        abstract: content,
        publicationDate: new Date(),
        tags: metadata?.type || 'document',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const paper = await db.insert(paperData, 'papers');

      // Add to local state
      const newDoc: Document = {
        id: String(paper.id),
        content,
        metadata
      };

      setDocuments(prev => [...prev, newDoc]);
      return paper.id;
    } catch (err) {
      console.error('Failed to add document:', err);
      throw err;
    }
  }, [db]);

  const searchDocuments = useCallback(async (query: string): Promise<SearchDocumentResult[]> => {
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      const results = await db.search(query, {
        table: 'papers',
        limit: 3
      });

      return (results as Array<{ abstract?: string; title?: string; score?: number }>).map((result) => ({
        content: result.abstract || result.title || '',
        similarity: typeof result.score === 'number' ? result.score : 0
      }));
    } catch (err) {
      console.error('Search failed:', err);
      throw err;
    }
  }, [db]);

  const sendMessage = useCallback(async (message: string) => {
    if (!db) {
      throw new Error('Database not initialized');
    }

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      // Search for relevant documents
      const searchResults = await searchDocuments(message);

      // Generate response based on search results
      let response = "I don't have enough information to answer that question.";
      let sources: Array<{ content: string; similarity: number }> = [];

      if (searchResults.length > 0) {
        sources = searchResults;

        // Simple response generation based on the most relevant document
        const mostRelevant = searchResults[0];
        response = `Based on my knowledge base: ${mostRelevant.content.substring(0, 200)}...`;

        if (searchResults.length > 1) {
          response += `\n\nI found ${searchResults.length - 1} additional relevant documents.`;
        }
      } else {
        response = "I couldn't find any relevant information in my knowledge base. Try uploading some documents first!"
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        sources
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Failed to process message:', err);

      // Add error message
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: "I encountered an error while searching my knowledge base. Please try again.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  }, [db, searchDocuments]);

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const clearDocuments = useCallback(async () => {
    if (!db) return;

    try {
      // Get all papers and delete them
      const papers = await db.getAll('papers');
      for (const paper of papers) {
        await db.delete(paper.id, 'papers');
      }
      setDocuments([]);
    } catch (err) {
      console.error('Failed to clear documents:', err);
    }
  }, [db]);

  return {
    isLoading,
    error,
    addDocument: addDocumentToDB,
    searchDocuments,
    sendMessage,
    messages,
    setMessages: setMessages as Dispatch<SetStateAction<ChatMessage[]>>,
    documents,
    clearChat,
    clearDocuments
  };
}
