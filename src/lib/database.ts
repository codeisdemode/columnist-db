import { z } from 'zod';
import { Columnist, defineTable, BasicEmbeddingProvider } from 'columnist-db-core';

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

type ResolvedEmbeddingProvider = {
  generateEmbedding: (text: string) => Promise<Float32Array>;
  dimensions: number;
  model: string;
};

let embeddingProvider: ResolvedEmbeddingProvider | null = null;
const embeddingCache = new Map<string, Float32Array>();
let researchDBPromise: Promise<any> | null = null;

function ensureEmbeddingProvider(): ResolvedEmbeddingProvider {
  if (!embeddingProvider) {
    const provider = new BasicEmbeddingProvider();
    embeddingProvider = {
      generateEmbedding: (text: string) => provider.generateEmbedding(text),
      dimensions: provider.getDimensions(),
      model: provider.getModel(),
    };
  }

  if (embeddingProvider.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding provider dimension mismatch. Expected ${EMBEDDING_DIMENSIONS}, received ${embeddingProvider.dimensions}`);
  }

  return embeddingProvider;
}

async function getCachedEmbedding(text: string): Promise<Float32Array> {
  const provider = ensureEmbeddingProvider();
  const key = text.trim();

  if (!key) {
    return new Float32Array(provider.dimensions);
  }

  const cached = embeddingCache.get(key);
  if (cached) {
    return new Float32Array(cached);
  }

  const vector = await provider.generateEmbedding(text);
  if (!(vector instanceof Float32Array) || vector.length !== provider.dimensions) {
    throw new Error(`Embedding provider returned vector with dimension ${vector.length}, expected ${provider.dimensions}`);
  }

  const stored = new Float32Array(vector);
  embeddingCache.set(key, stored);
  return new Float32Array(stored);
}

export const setEmbeddingProvider = (provider: {
  generateEmbedding(text: string): Promise<Float32Array>;
  getDimensions(): number;
  getModel?(): string;
}): void => {
  const dimensions = provider.getDimensions();
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Custom embedding provider must use ${EMBEDDING_DIMENSIONS}-dimension vectors to match the schema.`);
  }

  embeddingProvider = {
    generateEmbedding: (text: string) => provider.generateEmbedding(text),
    dimensions,
    model: typeof provider.getModel === 'function' ? provider.getModel() : 'custom-provider',
  };
  embeddingCache.clear();
};

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

      ensureEmbeddingProvider();
      db.registerEmbedder('papers', async (text: string) => getCachedEmbedding(text));

      return db;
    })();
  }

  return researchDBPromise;
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const vector = await getCachedEmbedding(text);
  return Array.from(vector);
};

export const getEmbeddingMetadata = () => {
  const provider = ensureEmbeddingProvider();
  return {
    model: provider.model,
    dimensions: provider.dimensions,
    cacheSize: embeddingCache.size,
  };
};