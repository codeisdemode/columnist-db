import { useCallback } from 'react';
import { useColumnist, useLiveQuery } from 'columnist-db-hooks';
import type { Note } from './types';

export function useNotes() {
  const { db } = useColumnist({ name: 'notes-app' });

  const createNote = useCallback(async (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!db) throw new Error('Database not initialized');
    return db.insert({
      ...note,
      createdAt: new Date(),
      updatedAt: new Date()
    }, 'notes');
  }, [db]);

  const updateNote = useCallback(async (id: number, updates: Partial<Omit<Note, 'id'>>) => {
    if (!db) throw new Error('Database not initialized');
    return db.update(id, {
      ...updates,
      updatedAt: new Date()
    }, 'notes');
  }, [db]);

  const deleteNote = useCallback(async (id: number) => {
    if (!db) throw new Error('Database not initialized');
    return db.delete(id, 'notes');
  }, [db]);

  return {
    createNote,
    updateNote,
    deleteNote
  };
}

export function useLiveNotes(options?: { category?: string; limit?: number }) {
  return useLiveQuery<Note>({
    table: 'notes',
    where: options?.category ? { category: options.category } : {},
    orderBy: { field: 'updatedAt', direction: 'desc' },
    limit: options?.limit || 50,
    subscribe: true
  });
}

export function useNotesSearch(query: string, options?: { category?: string; limit?: number }) {
  const { db } = useColumnist({ name: 'notes-app' });
  
  const searchNotes = useCallback(async () => {
    if (!db || !query.trim()) return [];
    
    const searchOptions: any = { 
      table: 'notes',
      limit: options?.limit || 20 
    };
    
    if (options?.category) {
      searchOptions.category = options.category;
    }
    
    return db.search(query, searchOptions);
  }, [db, query, options]);

  return searchNotes;
}