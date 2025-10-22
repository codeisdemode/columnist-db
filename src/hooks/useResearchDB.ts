'use client';

import { useState, useEffect } from 'react';
import { getResearchDB, Paper, Note } from '@/lib/database';

export function useResearchDB() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeDB = async () => {
      try {
        if (typeof window === 'undefined') {
          setIsLoading(false);
          return;
        }

        const db = await getResearchDB();
        setIsLoading(false);
      } catch (err) {
        console.error('Database initialization failed:', err);
        if (err instanceof Error) {
          console.error('Error details:', {
            name: err.name,
            message: err.message,
            stack: err.stack
          });
          setError(err.message);
        } else {
          setError('Failed to initialize database');
        }
        setIsLoading(false);
      }
    };

    initializeDB();
  }, []);

  const addPaper = async (paperData: Omit<Paper, 'id' | 'createdAt' | 'updatedAt'> & { authors?: string | string[]; tags?: string | string[] }) => {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Database operations are only available in browser environment');
      }

      const db = await getResearchDB();

      if (typeof db.insert !== 'function') {
        console.error('Database insert method is not available:', db);
        throw new Error('Database insert operation not available');
      }

      const paper: Paper = {
        ...paperData,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authors: Array.isArray(paperData.authors) ? paperData.authors.join(', ') : paperData.authors,
        tags: Array.isArray(paperData.tags) ? paperData.tags.join(', ') : paperData.tags,
      };

      await db.insert(paper, 'papers');
      return paper;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add paper');
    }
  };

  const addNote = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Database operations are only available in browser environment');
      }

      const db = await getResearchDB();

      if (typeof db.insert !== 'function') {
        console.error('Database insert method is not available:', db);
        throw new Error('Database insert operation not available');
      }

      const note: Note = {
        ...noteData,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.insert(note, 'notes');
      return note;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add note');
    }
  };

  const searchPapers = async (query: string) => {
    try {
      if (typeof window === 'undefined') {
        return [];
      }

      const db = await getResearchDB();

      if (typeof db.search !== 'function') {
        console.error('Database search method is not available:', db);
        return [];
      }

      // First try searching with just the table
      let results = await db.search(query, {
        table: 'papers'
      });

      // If no results, try using the find method as an alternative
      if (results.length === 0 && typeof db.find === 'function') {
        // Get all papers and filter manually
        const allPapers = await db.getAll('papers');

        // Simple text search across title and abstract
        const searchTerm = query.toLowerCase();
        results = allPapers.filter((paper: any) => {
          return (
            paper.title?.toLowerCase().includes(searchTerm) ||
            paper.abstract?.toLowerCase().includes(searchTerm)
          );
        });
      }

      return results as Paper[];
    } catch (err) {
      console.error('Search error:', err);
      throw new Error(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const getAllPapers = async () => {
    try {
      if (typeof window === 'undefined') {
        return [];
      }

      const db = await getResearchDB();

      if (typeof db.getAll !== 'function') {
        console.error('Database getAll method is not available:', db);
        return [];
      }

      const papers = await db.getAll('papers');
      return papers as Paper[];
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch papers');
    }
  };

  const getAllNotes = async () => {
    try {
      if (typeof window === 'undefined') {
        return [];
      }

      const db = await getResearchDB();

      if (typeof db.getAll !== 'function') {
        console.error('Database getAll method is not available:', db);
        return [];
      }

      const notes = await db.getAll('notes');
      return notes as Note[];
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch notes');
    }
  };

  const getNotesForPaper = async (paperId: string) => {
    try {
      if (typeof window === 'undefined') {
        return [];
      }

      const db = await getResearchDB();

      if (typeof db.find !== 'function') {
        console.error('Database find method is not available:', db);
        return [];
      }

      const notes = await db.find({
        table: 'notes',
        where: { paperId }
      });
      return notes as Note[];
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch notes for paper');
    }
  };

  const deletePaper = async (paperId: string) => {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Database operations are only available in browser environment');
      }

      const db = await getResearchDB();

      if (typeof db.delete !== 'function') {
        console.error('Database delete method is not available:', db);
        throw new Error('Database delete operation not available');
      }

      await db.delete(paperId, 'papers');
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete paper');
    }
  };

  return {
    isLoading,
    error,
    addPaper,
    addNote,
    searchPapers,
    getAllPapers,
    getAllNotes,
    getNotesForPaper,
    deletePaper
  };
}