import { Columnist } from 'columnist-db-core';
import { OpenAIEmbeddingProvider } from 'columnist-db-plugin-openai-embedding';
import {
  RAGDatabaseOptions,
  Document,
  SearchResult,
  SearchOptions,
  RAGStats
} from './types';

export class RAGDatabase {
  private db: any;
  private embeddingProvider: OpenAIEmbeddingProvider | null = null;
  private options: RAGDatabaseOptions;
  private isInitialized = false;

  constructor(options: Partial<RAGDatabaseOptions> = {}) {
    this.options = {
      name: 'rag-db',
      embeddingModel: 'auto',
      chunkingStrategy: 'semantic',
      searchStrategy: 'hybrid',
      syncEnabled: false,
      ...options
    };

    // Initialize the underlying database
    this.db = Columnist;
    // Schema will be initialized when the database is first used
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize the database with schema
      await this.db.init(this.options.name, {
        schema: {
          documents: {
            columns: {
              id: 'string',
              content: 'text',
              metadata: 'json',
              embeddings: 'vector',
              chunkId: 'string',
              createdAt: 'date',
              updatedAt: 'date'
            }
          },
          chunks: {
            columns: {
              id: 'string',
              documentId: 'string',
              content: 'text',
              embeddings: 'vector',
              metadata: 'json',
              createdAt: 'date'
            }
          }
        }
      });
    } catch (error) {
      // Fallback to in-memory storage for Node.js environments
      if (error instanceof Error && error.message.includes('IndexedDB is not available')) {
        console.warn('Using in-memory storage for Node.js environment');
      } else {
        throw error;
      }
    }

    // Initialize embedding provider if API key is provided
    if (this.options.apiKey) {
      this.embeddingProvider = new OpenAIEmbeddingProvider({
        apiKey: this.options.apiKey,
        model: this.options.embeddingModel === 'auto' ? 'text-embedding-3-small' : this.options.embeddingModel
      });
    }

    // Initialize sync if enabled
    if (this.options.syncEnabled && this.options.syncAdapter) {
      await this.initializeSync();
    }

    this.isInitialized = true;
  }

  private async initializeSync(): Promise<void> {
    // TODO: Implement sync initialization based on adapter
    console.log('Sync initialization not yet implemented');
  }

  async addDocument(content: string, metadata: Record<string, any> = {}): Promise<string> {
    await this.initialize();

    const documentId = this.generateId();
    const now = new Date();

    // Chunk the content
    const chunks = await this.chunkContent(content);

    // Store main document
    const document: Document = {
      id: documentId,
      content,
      metadata,
      createdAt: now,
      updatedAt: now
    };

    await this.db.insert('documents', document);

    // Store chunks with embeddings
    for (const chunk of chunks) {
      const chunkId = this.generateId();
      let embeddings: Float32Array | undefined;

      if (this.embeddingProvider) {
        embeddings = await this.embeddingProvider.generateEmbedding(chunk);
      }

      await this.db.insert('chunks', {
        id: chunkId,
        documentId,
        content: chunk,
        embeddings,
        metadata: { ...metadata, chunkIndex: chunks.indexOf(chunk) },
        createdAt: now
      });
    }

    return documentId;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.initialize();

    const limit = options.limit || 10;
    const threshold = options.threshold || 0.5;

    let results: SearchResult[] = [];

    // Hybrid search: semantic + keyword
    if (this.options.searchStrategy === 'hybrid' || this.options.searchStrategy === 'semantic') {
      const semanticResults = await this.semanticSearch(query, limit, threshold);
      results.push(...semanticResults);
    }

    if (this.options.searchStrategy === 'hybrid' || this.options.searchStrategy === 'keyword') {
      const keywordResults = await this.keywordSearch(query, limit, threshold);
      results.push(...keywordResults);
    }

    // Deduplicate and rank results
    const uniqueResults = this.deduplicateResults(results);
    const rankedResults = this.rankResults(uniqueResults, query);

    return rankedResults.slice(0, limit);
  }

  private async semanticSearch(query: string, limit: number, threshold: number): Promise<SearchResult[]> {
    if (!this.embeddingProvider) {
      return [];
    }

    const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);

    const results = await (this.db as any).vectorSearch('chunks', queryEmbedding, {
      limit: limit * 2, // Get more for ranking
      metric: 'cosine'
    });

    return results
      .filter((result: any) => result.score >= threshold)
      .map((result: any) => ({
        document: {
          id: result.id.toString(),
          content: result.content,
          metadata: result.metadata || {},
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt || result.createdAt)
        },
        score: result.score,
        relevance: this.scoreToRelevance(result.score),
        highlights: this.generateHighlights(result.content, query)
      }));
  }

  private async keywordSearch(query: string, limit: number, threshold: number): Promise<SearchResult[]> {
    const results = await (this.db as any).search(query, {
      table: 'chunks',
      limit: limit * 2
    });

    return results
      .filter((result: any) => result.score >= threshold)
      .map((result: any) => ({
        document: {
          id: result.id.toString(),
          content: result.content,
          metadata: result.metadata || {},
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt || result.createdAt)
        },
        score: result.score,
        relevance: this.scoreToRelevance(result.score),
        highlights: this.generateHighlights(result.content, query)
      }));
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = result.document.id;
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

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async getStats(): Promise<RAGStats> {
    await this.initialize();

    const documents = await this.db.getAll('documents');
    const chunks = await this.db.getAll('chunks');

    return {
      totalDocuments: documents.length,
      totalChunks: chunks.length,
      embeddingModel: this.embeddingProvider?.getModel() || 'none',
      searchPerformance: {
        avgResponseTime: 0, // TODO: Track performance
        totalQueries: 0,
        cacheHitRate: 0
      }
    };
  }

  async clear(): Promise<void> {
    await this.db.clear('documents');
    await this.db.clear('chunks');
  }
}