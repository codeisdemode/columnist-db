import { z } from 'zod';
import { BasicEmbeddingProvider, Columnist, defineTable } from 'columnist-db-core';

const EMBEDDING_DIMENSIONS = 128;

// Define table schemas using the columnist-db API
export const papersTable = defineTable()
  .column('id', 'string')
  .column('title', 'string')
  .column('authors', 'string') // Change from string[] to string for better search compatibility
  .column('abstract', 'string')
  .column('publicationDate', 'date')
  .column('tags', 'string') // Change from string[] to string for better search compatibility
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .primaryKey('id')
  .searchable('title', 'abstract', 'authors', 'tags')
  .vector({ field: 'abstract', dims: EMBEDDING_DIMENSIONS })
  .validate(z.object({
    id: z.string(),
    title: z.string(),
    authors: z.string(), // Change from z.array(z.string()) to z.string()
    abstract: z.string(),
    publicationDate: z.date(),
    tags: z.string(), // Change from z.array(z.string()) to z.string()
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

type ResearchDB = Awaited<ReturnType<typeof Columnist.init>>;
let researchDBPromise: Promise<ResearchDB> | null = null;
const embeddingProvider = new BasicEmbeddingProvider();

export const getResearchDB = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Database is only available in browser environment');
  }

  if (!researchDBPromise) {
    researchDBPromise = (async () => {
      const db = await Columnist.init('research-assistant', {
        version: 1,
        schema: {
          papers: papersTable,
          notes: notesTable,
        },
      });

      db.registerEmbedder('papers', async (text: string) => embeddingProvider.generateEmbedding(text));

      return db;
    })();
  }

  return researchDBPromise;
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const vector = await embeddingProvider.generateEmbedding(text);
  return Array.from(vector);
};

export const getEmbeddingMetadata = () => {
  return {
    model: embeddingProvider.getModel(),
    dimensions: EMBEDDING_DIMENSIONS,
    cacheSize: 0,
  };
};
