import { z } from 'zod';
import { Columnist, defineTable } from 'columnist-db-core';

// Define table schemas using the columnist-db API
export const papersTable = defineTable()
  .column('id', 'string')
  .column('title', 'string')
  .column('authors', 'string') // Change from string[] to string for better search compatibility
  .column('abstract', 'string')
  .column('publicationDate', 'date')
  .column('tags', 'string') // Change from string[] to string for better search compatibility
  .column('vectorEmbedding', 'json')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .primaryKey('id')
  .searchable('title', 'abstract', 'authors', 'tags')
  .vector({ field: 'vectorEmbedding', dims: 50 })
  .validate(z.object({
    id: z.string(),
    title: z.string(),
    authors: z.string(), // Change from z.array(z.string()) to z.string()
    abstract: z.string(),
    publicationDate: z.date(),
    tags: z.string(), // Change from z.array(z.string()) to z.string()
    vectorEmbedding: z.array(z.number()).optional(),
    createdAt: z.date(),
    updatedAt: z.date()
  }))
  .build();

export const notesTable = defineTable()
  .column('id', 'string')
  .column('content', 'string')
  .column('tags', 'json')
  .column('paperId', 'string')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .primaryKey('id')
  .searchable('content', 'tags')
  .validate(z.object({
    id: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    paperId: z.string().optional(),
    createdAt: z.date(),
    updatedAt: z.date()
  }))
  .build();

// Database schema
export type DatabaseSchema = {
  papers: typeof papersTable;
  notes: typeof notesTable;
};

export type Paper = {
  id: string;
  title: string;
  authors: string; // Changed from string[] to string
  abstract: string;
  publicationDate: Date;
  tags: string; // Changed from string[] to string
  vectorEmbedding?: number[];
  createdAt: Date;
  updatedAt: Date;
};

export type Note = {
  id: string;
  content: string;
  tags: string[];
  paperId?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Database initialization - lazy initialization to avoid SSR issues
let researchDBInstance: any = null;

export const getResearchDB = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Database is only available in browser environment');
  }

  if (!researchDBInstance) {
    try {
      console.log('Attempting to initialize Columnist database...');
      console.log('Papers table schema:', papersTable);
      console.log('Notes table schema:', notesTable);

      researchDBInstance = await Columnist.init('research-assistant', {
        version: 1,
        schema: {
          papers: papersTable,
          notes: notesTable
        }
      });
      console.log('Columnist database initialized successfully:', researchDBInstance);
      console.log('Database methods:', Object.keys(researchDBInstance));

      // Check if search method exists and test it
      if (typeof researchDBInstance.search === 'function') {
        console.log('Search method is available');
      } else {
        console.log('Search method is NOT available');
      }
    } catch (error) {
      console.error('Failed to initialize Columnist database:', error);

      // Create a simple in-memory fallback
      researchDBInstance = {
        insert: async (record: any, table: string) => {
          console.log('In-memory insert:', table, record);
          return { id: record.id || crypto.randomUUID() };
        },
        getAll: async (table: string, limit?: number) => {
          console.log('In-memory getAll:', table);
          return [];
        },
        search: async (query: string, options?: any) => {
          console.log('In-memory search:', query, options);
          return [];
        },
        find: async (options: any) => {
          console.log('In-memory find:', options);
          return [];
        },
        delete: async (id: string, table: string) => {
          console.log('In-memory delete:', table, id);
        }
      };

      console.warn('Using in-memory fallback database. Data will not persist.');
    }
  }

  return researchDBInstance;
};

// Helper function to generate embeddings (placeholder implementation)
export const generateEmbedding = async (text: string): Promise<number[]> => {
  // Simple word frequency-based embedding as placeholder
  // In production, this would use OpenAI API or similar
  const words = text.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();

  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });

  // Create a simple embedding vector
  const embedding = Array.from({ length: 50 }, (_, i) => {
    const word = `word${i}`;
    return wordCounts.get(word) || 0;
  });

  return embedding;
};