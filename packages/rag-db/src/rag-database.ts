import { performance } from 'node:perf_hooks';

import { Columnist, BasicEmbeddingProvider } from 'columnist-db-core';
import { OpenAIEmbeddingProvider } from 'columnist-db-plugin-openai-embedding';
import {
  RAGDatabaseOptions,
  RAGDatabaseInitOptions,
  RAGDatabaseOptionsSchema,
  SearchResult,
  SearchOptions,
  RAGStats,
  EmbeddingProviderLike,
} from './types';

type ColumnistInitOptions = Exclude<Parameters<typeof Columnist.init>[1], undefined>;

type EmbeddingEngine = EmbeddingProviderLike;

export class RAGDatabase {
  private db: any = null;
  private embeddingProvider: EmbeddingEngine | null = null;
  private options: RAGDatabaseOptions;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private queryCache = new Map<string, { timestamp: number; results: SearchResult[] }>();
  private cacheDurationMs = 60_000;
  private cacheMaxEntries = 100;
  private syncAdapterName: string | null = null;
  private metrics = {
    totalQueries: 0,
    totalDurationMs: 0,
    cacheHits: 0
  };

  constructor(options: RAGDatabaseInitOptions = {}) {
    const { embeddingProvider, ...config } = options;
    const parsed = RAGDatabaseOptionsSchema.parse(config);

    this.options = {
      ...parsed,
      embeddingProvider,
    };

    this.cacheDurationMs = this.options.cacheDurationMs;
    this.cacheMaxEntries = this.options.cacheMaxEntries;

    const resolvedModel = this.options.embeddingModel === 'auto'
      ? 'text-embedding-3-small'
      : this.options.embeddingModel;

    if (this.options.embeddingProvider) {
      this.embeddingProvider = this.options.embeddingProvider;
    } else if (this.options.apiKey) {
      this.embeddingProvider = new OpenAIEmbeddingProvider({
        apiKey: this.options.apiKey,
        model: resolvedModel
      });
      this.options.embeddingProvider = this.embeddingProvider;
    } else {
      this.embeddingProvider = new BasicEmbeddingProvider();
      this.options.embeddingProvider = this.embeddingProvider;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.setupDatabase()
        .then(() => {
          this.isInitialized = true;
        })
        .finally(() => {
          this.initializationPromise = null;
        });
    }

    await this.initializationPromise;
  }

  private async setupDatabase(): Promise<void> {
    const embeddingDims = this.embeddingProvider?.getDimensions() ?? 128;

    const initOptions: ColumnistInitOptions = {
      autoInitialize: false,
      schema: {
        documents: {
          columns: {
            id: 'number',
            content: 'string',
            metadata: 'json',
            createdAt: 'date',
            updatedAt: 'date'
          },
          primaryKey: 'id',
          searchableFields: ['content']
        },
        chunks: {
          columns: {
            id: 'number',
            documentId: 'number',
            content: 'string',
            metadata: 'json',
            createdAt: 'date',
            updatedAt: 'date'
          },
          primaryKey: 'id',
          searchableFields: ['content'],
          vector: {
            field: 'content',
            dims: embeddingDims
          }
        }
      }
    };

    if (this.options.syncEnabled && this.options.syncAdapter) {
      initOptions.sync = { enabled: true };
    }

    this.db = await Columnist.init(this.options.name, initOptions);

    if (this.embeddingProvider) {
      this.db.registerEmbedder('chunks', async (text: string) => {
        return this.embeddingProvider!.generateEmbedding(text);
      });
    }

    if (this.options.syncEnabled && this.options.syncAdapter) {
      await this.initializeSync();
    }
  }

  private async initializeSync(): Promise<void> {
    if (!this.options.syncEnabled || !this.options.syncAdapter || !this.db) {
      return;
    }

    if (this.syncAdapterName) {
      return;
    }

    const dbOptions = typeof (this.db as any).getOptions === 'function'
      ? (this.db as any).getOptions()
      : undefined;

    if (!dbOptions?.sync || dbOptions.sync.enabled !== true) {
      return;
    }

    const adapterName = `${this.options.name}-${this.options.syncAdapter}-sync`;
    const adapterOptions = {
      ...(this.options.syncConfig ?? {}),
      tables: ['documents', 'chunks']
    };

    try {
      await this.db.registerSyncAdapter(adapterName, this.options.syncAdapter, adapterOptions);
      await this.db.startSync(adapterName);
      this.syncAdapterName = adapterName;
    } catch (error) {
      console.error('Failed to initialize sync adapter:', error);
      throw error;
    }
  }

  async addDocument(content: string, metadata: Record<string, any> = {}): Promise<string> {
    await this.initialize();

    const db = this.db;
    if (!db) {
      throw new Error('RAG database has not been initialized');
    }

    const now = new Date();
    const chunks = await this.chunkContent(content);
    if (chunks.length === 0) {
      chunks.push(content);
    }

    const { id: insertedId } = await db.insert(
      {
        content,
        metadata,
        createdAt: now,
        updatedAt: now
      },
      'documents'
    );

    for (const [index, chunk] of chunks.entries()) {
      await db.insert(
        {
          documentId: insertedId,
          content: chunk,
          metadata: { ...metadata, documentId: insertedId, chunkIndex: index },
          createdAt: now,
          updatedAt: now
        },
        'chunks'
      );
    }

    this.queryCache.clear();
    return insertedId.toString();
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.initialize();

    const limit = options.limit || 10;
    const threshold = options.threshold || 0.5;

    const cacheKey = JSON.stringify({ query, options: { ...options, limit, threshold } });
    this.pruneCache(Date.now());
    const cached = this.queryCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < this.cacheDurationMs) {
      this.metrics.totalQueries += 1;
      this.metrics.cacheHits += 1;
      cached.timestamp = now;
      this.touchCacheEntry(cacheKey, cached);
      return this.cloneResults(cached.results).slice(0, limit);
    }

    const start = performance.now();
    let results: SearchResult[] = [];

    if (this.options.searchStrategy === 'hybrid' || this.options.searchStrategy === 'semantic') {
      const semanticResults = await this.semanticSearch(query, limit, threshold);
      results.push(...semanticResults);
    }

    if (this.options.searchStrategy === 'hybrid' || this.options.searchStrategy === 'keyword') {
      const keywordResults = await this.keywordSearch(query, limit, threshold);
      results.push(...keywordResults);
    }

    const uniqueResults = this.deduplicateResults(results);
    const rankedResults = this.rankResults(uniqueResults, query);
    const limited = rankedResults.slice(0, limit);

    const duration = performance.now() - start;
    this.metrics.totalQueries += 1;
    this.metrics.totalDurationMs += duration;
    this.queryCache.set(cacheKey, { timestamp: now, results: this.cloneResults(limited) });
    this.enforceCacheLimit();

    return this.cloneResults(limited);
  }

  private async semanticSearch(query: string, limit: number, threshold: number): Promise<SearchResult[]> {
    if (!this.embeddingProvider) {
      return [];
    }

    const db = this.db;
    if (!db) {
      return [];
    }

    const results = await db.vectorSearchText('chunks', query, {
      limit: limit * 2,
      metric: 'cosine'
    });

    return results
      .filter((result: any) => result.score >= threshold)
      .map((result: any) => this.buildSearchResult(result, query));
  }

  private async keywordSearch(query: string, limit: number, threshold: number): Promise<SearchResult[]> {
    const db = this.db;
    if (!db) {
      return [];
    }

    const results = await db.search(query, {
      table: 'chunks',
      limit: limit * 2
    });

    return results
      .filter((result: any) => result.score >= threshold)
      .map((result: any) => this.buildSearchResult(result, query));
  }

  private buildSearchResult(raw: any, query: string): SearchResult {
    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt);
    const updatedAtRaw = raw.updatedAt ?? raw.createdAt;
    const updatedAt = updatedAtRaw instanceof Date ? updatedAtRaw : new Date(updatedAtRaw);

    return {
      document: {
        id: raw.id.toString(),
        content: raw.content,
        metadata: { ...(raw.metadata || {}), documentId: raw.documentId },
        chunkId: raw.id.toString(),
        createdAt,
        updatedAt
      },
      score: raw.score,
      relevance: this.scoreToRelevance(raw.score),
      highlights: this.generateHighlights(raw.content, query)
    };
  }

  private cloneResults(results: SearchResult[]): SearchResult[] {
    return results.map(result => ({
      ...result,
      document: {
        ...result.document,
        metadata: { ...(result.document.metadata || {}) },
        createdAt: new Date(result.document.createdAt),
        updatedAt: new Date(result.document.updatedAt)
      },
      highlights: result.highlights ? [...result.highlights] : undefined
    }));
  }

  private touchCacheEntry(key: string, entry: { timestamp: number; results: SearchResult[] }): void {
    this.queryCache.delete(key);
    this.queryCache.set(key, entry);
  }

  private pruneCache(now: number): void {
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp >= this.cacheDurationMs) {
        this.queryCache.delete(key);
      }
    }
  }

  private enforceCacheLimit(): void {
    while (this.queryCache.size > this.cacheMaxEntries) {
      const oldestKey = this.queryCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.queryCache.delete(oldestKey);
    }
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const metaId = (result.document.metadata && (result.document.metadata as any).documentId) ?? result.document.id;
      const key = metaId != null ? metaId.toString() : result.document.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private rankResults(results: SearchResult[], query: string): SearchResult[] {
    return results.sort((a, b) => {
      // Combine score with additional ranking factors
      const aRank = a.score + this.calculateAdditionalRelevance(a, query);
      const bRank = b.score + this.calculateAdditionalRelevance(b, query);
      return bRank - aRank;
    });
  }

  private calculateAdditionalRelevance(result: SearchResult, query: string): number {
    let relevance = 0;

    // Boost for exact matches
    if (result.document.content.toLowerCase().includes(query.toLowerCase())) {
      relevance += 0.2;
    }

    // Boost for recent documents
    const daysOld = (Date.now() - result.document.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) relevance += 0.1; // Recent documents get boost

    return relevance;
  }

  private async chunkContent(content: string): Promise<string[]> {
    switch (this.options.chunkingStrategy) {
      case 'semantic':
        return this.semanticChunking(content);
      case 'fixed':
        return this.fixedSizeChunking(content);
      case 'recursive':
        return this.recursiveChunking(content);
      default:
        return this.fixedSizeChunking(content);
    }
  }

  private semanticChunking(content: string): string[] {
    // Simple semantic chunking based on paragraphs and sentences
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length > 1000) {
        // Split long paragraphs
        const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
        let currentChunk = '';

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > 500) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
      } else {
        chunks.push(paragraph.trim());
      }
    }

    return chunks.filter(chunk => chunk.length > 50); // Minimum chunk size
  }

  private fixedSizeChunking(content: string, chunkSize: number = 500): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      let end = start + chunkSize;

      // Try to break at sentence boundaries
      if (end < content.length) {
        const nextPeriod = content.indexOf('.', end);
        const nextSpace = content.indexOf(' ', end);

        if (nextPeriod !== -1 && nextPeriod < end + 100) {
          end = nextPeriod + 1;
        } else if (nextSpace !== -1) {
          end = nextSpace;
        }
      }

      chunks.push(content.slice(start, end).trim());
      start = end;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  private recursiveChunking(content: string): string[] {
    // Simple recursive chunking - split by paragraphs first, then sentences
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length <= 500) {
        chunks.push(paragraph.trim());
      } else {
        // Split into sentences
        const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
        chunks.push(...this.fixedSizeChunking(sentences.join('. '), 300));
      }
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  private scoreToRelevance(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  private generateHighlights(content: string, query: string): string[] {
    const highlights: string[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);

    for (const word of queryWords) {
      if (word.length < 3) continue;

      const regex = new RegExp(`\\b${word}\\w*`, 'gi');
      const matches = content.match(regex);

      if (matches) {
        highlights.push(...matches.slice(0, 3)); // Limit highlights per word
      }
    }

    return [...new Set(highlights)].slice(0, 5); // Unique highlights, max 5
  }

  async getStats(): Promise<RAGStats> {
    await this.initialize();

    const db = this.db;
    if (!db) {
      throw new Error('RAG database has not been initialized');
    }

    const documents = await db.getAll('documents', Number.MAX_SAFE_INTEGER);
    const chunks = await db.getAll('chunks', Number.MAX_SAFE_INTEGER);

    return {
      totalDocuments: documents.length,
      totalChunks: chunks.length,
      embeddingModel: this.embeddingProvider?.getModel() || 'none',
      searchPerformance: {
        avgResponseTime: this.metrics.totalQueries
          ? this.metrics.totalDurationMs / this.metrics.totalQueries
          : 0,
        totalQueries: this.metrics.totalQueries,
        cacheHitRate: this.metrics.totalQueries
          ? this.metrics.cacheHits / this.metrics.totalQueries
          : 0
      }
    };
  }

  async clear(): Promise<void> {
    await this.initialize();

    const db = this.db;
    if (!db) {
      return;
    }

    const documents = await db.getAll('documents', Number.MAX_SAFE_INTEGER);
    const chunks = await db.getAll('chunks', Number.MAX_SAFE_INTEGER);

    if (documents.length > 0) {
      await db.bulkDelete(documents.map((doc: any) => doc.id), 'documents');
    }

    if (chunks.length > 0) {
      await db.bulkDelete(chunks.map((chunk: any) => chunk.id), 'chunks');
    }

    this.queryCache.clear();
  }
}
