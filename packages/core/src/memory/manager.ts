// Memory Manager with AI capabilities
// Implements vector embeddings, semantic search, and memory consolidation

import * as crypto from 'crypto';
import {
  MemoryRecord,
  MemoryQueryOptions,
  MemorySearchResult,
  SearchResult,
  DocumentRecord,
  DocumentChunk,
  DocumentSearchOptions,
  DocumentSearchResult,
  EmbeddingProvider,
  DocumentProcessingOptions
} from './types';

export class MemoryManager {
  private memories = new Map<string, MemoryRecord>();
  private vectorIndex: Map<string, number[]> = new Map();
  private documents = new Map<string, DocumentRecord>();
  private documentChunks = new Map<string, DocumentChunk>();
  private embeddingProvider: EmbeddingProvider | null = null;
  private initialized = false;

  constructor(private db: any) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize vector database connection if needed
      // For now, we'll use in-memory storage
      this.initialized = true;
      console.log('[MemoryManager] Initialized successfully');
    } catch (error) {
      console.error('[MemoryManager] Initialization failed:', error);
      throw error;
    }
  }

  async storeMemory(content: string, contentType: string = 'text', metadata?: any): Promise<string> {
    const memoryId = this.generateMemoryId();
    const now = Date.now();

    // Generate embedding vector
    const vector = await this.generateEmbedding(content);

    const memory: MemoryRecord = {
      id: memoryId,
      content,
      contentType,
      vector,
      metadata,
      importance: this.calculateInitialImportance(content, contentType),
      accessCount: 0,
      lastAccessed: now,
      createdAt: now,
      updatedAt: now,
      category: metadata?.category,
      tags: metadata?.tags
    };

    this.memories.set(memoryId, memory);
    this.vectorIndex.set(memoryId, vector);

    // Store in database if available
    if (this.db && this.db.memories) {
      await this.db.memories.insert(memory);
    }

    return memoryId;
  }

  async retrieveMemory(memoryId: string): Promise<MemoryRecord | null> {
    let memory = this.memories.get(memoryId);

    if (!memory && this.db && this.db.memories) {
      const results = await this.db.memories.find({ where: { id: memoryId } });
      memory = results[0] || null;
      if (memory) {
        this.memories.set(memoryId, memory);
        this.vectorIndex.set(memoryId, memory.vector);
      }
    }

    if (memory) {
      // Update access stats
      memory.accessCount++;
      memory.lastAccessed = Date.now();
      memory.importance = this.updateImportanceScore(memory);
      memory.updatedAt = Date.now();

      if (this.db && this.db.memories) {
        await this.db.memories.update(memoryId, {
          accessCount: memory.accessCount,
          lastAccessed: memory.lastAccessed,
          importance: memory.importance,
          updatedAt: memory.updatedAt
        });
      }
    }

    return memory || null;
  }

  async retrieveMemories(memoryIds: string[]): Promise<MemoryRecord[]> {
    const memories: MemoryRecord[] = [];

    for (const memoryId of memoryIds) {
      const memory = await this.retrieveMemory(memoryId);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  async retrieveContextualMemories(context: string, limit: number = 10): Promise<SearchResult[]> {
    const contextVector = await this.generateEmbedding(context);
    const allMemories = Array.from(this.memories.values());

    // Calculate similarity scores
    const scoredMemories = allMemories.map(memory => {
      const similarity = this.cosineSimilarity(contextVector, memory.vector);
      const relevance = this.calculateRelevanceScore(memory, similarity);

      return {
        memory,
        relevance,
        similarity
      };
    });

    // Sort by relevance and return top results
    return scoredMemories
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  async searchMemories(query: string, options: MemoryQueryOptions = {}): Promise<SearchResult[]> {
    const {
      limit = 10,
      minImportance = 0,
      category,
      tags = [],
      semanticSearch,
      includeRelated = false
    } = options;

    let memories = Array.from(this.memories.values());

    // Filter by importance
    memories = memories.filter(memory => memory.importance >= minImportance);

    // Filter by category
    if (category) {
      memories = memories.filter(memory => memory.category === category);
    }

    // Filter by tags
    if (tags.length > 0) {
      memories = memories.filter(memory =>
        memory.tags && tags.some(tag => memory.tags!.includes(tag))
      );
    }

    // Semantic search
    if (semanticSearch) {
      const queryVector = await this.generateEmbedding(semanticSearch);
      const scoredMemories = memories.map(memory => {
        const similarity = this.cosineSimilarity(queryVector, memory.vector);
        const relevance = this.calculateRelevanceScore(memory, similarity);

        return {
          memory,
          relevance,
          similarity
        };
      });

      return scoredMemories
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, limit);
    }

    // Keyword search (fallback)
    if (query) {
      const queryLower = query.toLowerCase();
      memories = memories.filter(memory =>
        memory.content.toLowerCase().includes(queryLower) ||
        memory.tags?.some(tag => tag.toLowerCase().includes(queryLower))
      );
    }

    // Sort by importance and recency
    return memories
      .sort((a, b) => {
        const scoreA = a.importance * (a.lastAccessed / Date.now());
        const scoreB = b.importance * (b.lastAccessed / Date.now());
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .map(memory => ({
        memory,
        relevance: memory.importance,
        similarity: 0
      }));
  }

  async consolidateMemoriesWithMetadata(metadata: any): Promise<any> {
    const now = Date.now();
    const consolidationThreshold = metadata?.threshold || 0.8;
    const maxMemories = metadata?.maxMemories || 1000;

    // Get all memories sorted by importance
    const allMemories = Array.from(this.memories.values())
      .sort((a, b) => b.importance - a.importance);

    if (allMemories.length <= maxMemories) {
      return {
        retained: allMemories.length,
        compressed: 0,
        discarded: 0,
        spaceSaved: 0,
        improvementRatio: 1
      };
    }

    // Find similar memories to compress
    const toCompress: string[] = [];
    const toKeep: MemoryRecord[] = [];

    for (let i = 0; i < allMemories.length; i++) {
      if (toKeep.length >= maxMemories) {
        toCompress.push(allMemories[i].id);
        continue;
      }

      const current = allMemories[i];
      let shouldKeep = true;

      // Check for similar memories already being kept
      for (const kept of toKeep) {
        const similarity = this.cosineSimilarity(current.vector, kept.vector);
        if (similarity > consolidationThreshold) {
          shouldKeep = false;
          toCompress.push(current.id);
          break;
        }
      }

      if (shouldKeep) {
        toKeep.push(current);
      }
    }

    // Remove compressed memories
    for (const memoryId of toCompress) {
      this.memories.delete(memoryId);
      this.vectorIndex.delete(memoryId);
    }

    const result = {
      retained: toKeep.length,
      compressed: toCompress.length,
      discarded: 0,
      spaceSaved: toCompress.length,
      improvementRatio: allMemories.length / toKeep.length
    };

    // Update database if available
    if (this.db && this.db.memories) {
      for (const memoryId of toCompress) {
        await this.db.memories.delete(memoryId);
      }
    }

    return result;
  }

  async getStats(): Promise<any> {
    const allMemories = Array.from(this.memories.values());
    const totalMemories = allMemories.length;

    if (totalMemories === 0) {
      return {
        totalMemories: 0,
        averageImportance: 0,
        averageAccessCount: 0,
        categories: {},
        memorySize: 0
      };
    }

    const totalImportance = allMemories.reduce((sum, memory) => sum + memory.importance, 0);
    const totalAccessCount = allMemories.reduce((sum, memory) => sum + memory.accessCount, 0);

    // Count by category
    const categories: Record<string, number> = {};
    allMemories.forEach(memory => {
      const category = memory.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    });

    // Estimate memory size
    const memorySize = allMemories.reduce((size, memory) => {
      return size + JSON.stringify(memory).length;
    }, 0);

    return {
      totalMemories,
      averageImportance: totalImportance / totalMemories,
      averageAccessCount: totalAccessCount / totalMemories,
      categories,
      memorySize
    };
  }

  // Utility methods
  private generateMemoryId(): string {
    return `mem_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple text embedding using character frequency
    // In a real implementation, this would use a proper embedding model
    const embedding = new Array(128).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) % 128;
      embedding[charCode] += 1;
    }

    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }

    return embedding;
  }

  private calculateInitialImportance(content: string, contentType: string): number {
    let importance = 0.5; // Base importance

    // Content length factor
    const lengthFactor = Math.min(content.length / 1000, 1);
    importance += lengthFactor * 0.2;

    // Content type factor
    if (contentType === 'important' || contentType === 'critical') {
      importance += 0.3;
    }

    return Math.min(importance, 1);
  }

  private updateImportanceScore(memory: MemoryRecord): number {
    const baseImportance = memory.importance;
    const accessFactor = Math.min(memory.accessCount / 10, 0.3);
    const recencyFactor = Math.min((Date.now() - memory.createdAt) / (30 * 24 * 60 * 60 * 1000), 0.2);

    return Math.min(baseImportance + accessFactor + recencyFactor, 1);
  }

  private calculateRelevanceScore(memory: MemoryRecord, similarity: number): number {
    const similarityWeight = 0.6;
    const importanceWeight = 0.3;
    const recencyWeight = 0.1;

    const recency = Math.min((Date.now() - memory.lastAccessed) / (7 * 24 * 60 * 60 * 1000), 1);

    return (
      similarity * similarityWeight +
      memory.importance * importanceWeight +
      (1 - recency) * recencyWeight
    );
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Document Processing Methods

  /**
   * Register an embedding provider for document processing
   */
  registerEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
    console.log('[MemoryManager] Embedding provider registered:', provider.getModel());
  }

  /**
   * Unregister the current embedding provider
   */
  unregisterEmbeddingProvider(): void {
    this.embeddingProvider = null;
    console.log('[MemoryManager] Embedding provider unregistered');
  }

  /**
   * Check if an embedding provider is available
   */
  hasEmbeddingProvider(): boolean {
    return this.embeddingProvider !== null;
  }

  /**
   * Get information about the current embedding provider
   */
  getEmbeddingProviderInfo(): { model: string; dimensions: number } | null {
    if (!this.embeddingProvider) {
      return null;
    }
    return {
      model: this.embeddingProvider.getModel(),
      dimensions: this.embeddingProvider.getDimensions()
    };
  }

  /**
   * Add a document with automatic chunking
   */
  async addDocument(
    content: string,
    metadata: Record<string, any> = {},
    options: DocumentProcessingOptions = {}
  ): Promise<string> {
    await this.initialize();

    const documentId = this.generateDocumentId();
    const now = new Date();

    // Chunk the content
    const chunks = await this.chunkContent(content, options);

    // Store main document
    const nowTimestamp = Date.now();
    const document: DocumentRecord = {
      id: documentId,
      content,
      contentType: 'document',
      vector: await this.generateEmbedding(content),
      metadata: { ...metadata, originalLength: content.length },
      importance: this.calculateInitialImportance(content, 'document'),
      accessCount: 0,
      lastAccessed: nowTimestamp,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
      category: metadata?.category || 'document',
      tags: metadata?.tags,
      timestamp: now,
      chunks: [],
      chunkingStrategy: options.chunkingStrategy || 'semantic',
      originalLength: content.length,
      chunkCount: chunks.length,
      documentType: metadata?.documentType || 'general'
    };

    this.documents.set(documentId, document);

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkId = this.generateChunkId();

      let chunkVector: Float32Array | undefined;
      if (this.embeddingProvider && options.generateEmbeddings !== false) {
        try {
          chunkVector = await this.embeddingProvider.generateEmbedding(chunk);
        } catch (error) {
          console.warn('[MemoryManager] Failed to generate embedding for chunk, using fallback:', error);
          // Fallback to basic embedding
          const basicEmbedding = await this.generateEmbedding(chunk);
          chunkVector = new Float32Array(basicEmbedding);
        }
      } else if (options.generateEmbeddings !== false) {
        // Use basic embedding as fallback
        const basicEmbedding = await this.generateEmbedding(chunk);
        chunkVector = new Float32Array(basicEmbedding);
      }

      const documentChunk: DocumentChunk = {
        id: chunkId,
        documentId,
        content: chunk,
        metadata: {
          ...metadata,
          chunkIndex: i,
          totalChunks: chunks.length,
          embeddingProvider: this.embeddingProvider ? this.embeddingProvider.getModel() : 'basic'
        },
        chunkIndex: i,
        vector: chunkVector,
        createdAt: now,
        importance: this.calculateChunkImportance(chunk, i, chunks.length),
        accessCount: 0,
        lastAccessed: now
      };

      this.documentChunks.set(chunkId, documentChunk);
      document.chunks!.push(documentChunk);
    }

    // Store in database if available
    if (this.db && this.db.documents) {
      await this.db.documents.insert(document);
      for (const chunk of document.chunks!) {
        await this.db.documentChunks.insert(chunk);
      }
    }

    return documentId;
  }

  /**
   * Search documents with hybrid search capabilities
   */
  async searchDocuments(
    query: string,
    options: DocumentSearchOptions = {}
  ): Promise<DocumentSearchResult[]> {
    await this.initialize();

    const limit = options.limit || 10;
    const threshold = options.similarityThreshold || 0.5;

    let results: DocumentSearchResult[] = [];

    // Hybrid search: semantic + keyword
    if (options.searchStrategy === 'hybrid' || options.searchStrategy === 'semantic') {
      const semanticResults = await this.semanticDocumentSearch(query, limit * 2, threshold);
      results.push(...semanticResults);
    }

    if (options.searchStrategy === 'hybrid' || options.searchStrategy === 'keyword') {
      const keywordResults = await this.keywordDocumentSearch(query, limit * 2, threshold);
      results.push(...keywordResults);
    }

    // Deduplicate and rank results
    const uniqueResults = this.deduplicateDocumentResults(results);
    const rankedResults = this.rankDocumentResults(uniqueResults, query);

    // Add highlights if requested
    if (options.includeHighlights) {
      for (const result of rankedResults) {
        result.highlights = this.generateHighlights(result.memory.content, query);
      }
    }

    return rankedResults.slice(0, limit);
  }

  /**
   * Get all chunks for a specific document
   */
  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const [chunkId, chunk] of this.documentChunks) {
      if (chunk.documentId === documentId) {
        chunks.push(chunk);
      }
    }

    // Sort by chunk index
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  /**
   * Consolidate document chunks (merge similar chunks)
   */
  async consolidateDocumentChunks(documentId: string): Promise<void> {
    const chunks = await this.getDocumentChunks(documentId);
    if (chunks.length <= 1) return;

    // Simple consolidation: merge adjacent chunks with high similarity
    const consolidated: DocumentChunk[] = [];
    let currentChunk = chunks[0];

    for (let i = 1; i < chunks.length; i++) {
      const nextChunk = chunks[i];

      if (currentChunk.vector && nextChunk.vector) {
        const similarity = this.cosineSimilarity(
          Array.from(currentChunk.vector),
          Array.from(nextChunk.vector)
        );

        if (similarity > 0.8) {
          // Merge chunks
          currentChunk.content += ' ' + nextChunk.content;
          currentChunk.metadata.consolidated = true;
          currentChunk.metadata.mergedChunks = (currentChunk.metadata.mergedChunks || 1) + 1;
        } else {
          consolidated.push(currentChunk);
          currentChunk = nextChunk;
        }
      } else {
        consolidated.push(currentChunk);
        currentChunk = nextChunk;
      }
    }

    consolidated.push(currentChunk);

    // Update chunks in memory
    for (const chunk of chunks) {
      this.documentChunks.delete(chunk.id);
    }

    for (let i = 0; i < consolidated.length; i++) {
      const chunk = consolidated[i];
      chunk.chunkIndex = i;
      this.documentChunks.set(chunk.id, chunk);
    }

    // Update document
    const document = this.documents.get(documentId);
    if (document) {
      document.chunks = consolidated;
      document.chunkCount = consolidated.length;
    }
  }

  // Private helper methods for document processing

  private async chunkContent(
    content: string,
    options: DocumentProcessingOptions = {}
  ): Promise<string[]> {
    const strategy = options.chunkingStrategy || 'semantic';
    const maxChunkSize = options.maxChunkSize || 500;
    const minChunkSize = options.minChunkSize || 50;

    switch (strategy) {
      case 'semantic':
        return this.semanticChunking(content, maxChunkSize, minChunkSize);
      case 'fixed':
        return this.fixedSizeChunking(content, maxChunkSize);
      case 'recursive':
        return this.recursiveChunking(content, maxChunkSize, minChunkSize);
      default:
        return this.semanticChunking(content, maxChunkSize, minChunkSize);
    }
  }

  private semanticChunking(content: string, maxChunkSize: number = 500, minChunkSize: number = 50): string[] {
    // Simple semantic chunking based on paragraphs and sentences
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChunkSize) {
        // Split long paragraphs
        const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
        let currentChunk = '';

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > maxChunkSize) {
            if (currentChunk.length >= minChunkSize) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        }
        if (currentChunk.length >= minChunkSize) chunks.push(currentChunk.trim());
      } else if (paragraph.length >= minChunkSize) {
        chunks.push(paragraph.trim());
      }
    }

    return chunks;
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

      const chunk = content.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      start = end;
    }

    return chunks;
  }

  private recursiveChunking(content: string, maxChunkSize: number = 500, minChunkSize: number = 50): string[] {
    // Simple recursive chunking - split by paragraphs first, then sentences
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxChunkSize && paragraph.length >= minChunkSize) {
        chunks.push(paragraph.trim());
      } else {
        // Split into sentences
        const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const sentenceChunks = this.fixedSizeChunking(sentences.join('. '), Math.floor(maxChunkSize / 2));
        chunks.push(...sentenceChunks.filter(chunk => chunk.length >= minChunkSize));
      }
    }

    return chunks;
  }

  private async semanticDocumentSearch(query: string, limit: number, threshold: number): Promise<DocumentSearchResult[]> {
    if (!this.embeddingProvider) {
      console.log('[MemoryManager] No embedding provider available for semantic search, falling back to keyword search');
      return this.keywordDocumentSearch(query, limit, threshold);
    }

    let queryEmbedding: Float32Array;
    try {
      queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
    } catch (error) {
      console.warn('[MemoryManager] Failed to generate query embedding, falling back to keyword search:', error);
      return this.keywordDocumentSearch(query, limit, threshold);
    }

    const results: DocumentSearchResult[] = [];

    // Search through document chunks
    for (const [chunkId, chunk] of this.documentChunks) {
      if (chunk.vector) {
        const similarity = this.cosineSimilarity(Array.from(queryEmbedding), Array.from(chunk.vector));

        if (similarity >= threshold) {
          const document = this.documents.get(chunk.documentId);
          if (document) {
            results.push({
              memory: document,
              relevance: similarity,
              confidence: similarity,
              explanation: `Semantic match in chunk ${chunk.chunkIndex + 1}`,
              chunkRelevance: similarity,
              chunkIndex: chunk.chunkIndex,
              similarityScore: similarity
            });
          }
        }
      }
    }

    return results;
  }

  private async keywordDocumentSearch(query: string, limit: number, threshold: number): Promise<DocumentSearchResult[]> {
    const queryLower = query.toLowerCase();
    const results: DocumentSearchResult[] = [];

    // Search through document chunks
    for (const [chunkId, chunk] of this.documentChunks) {
      const contentLower = chunk.content.toLowerCase();

      // Simple keyword matching
      const queryWords = queryLower.split(/\s+/);
      let matchCount = 0;

      for (const word of queryWords) {
        if (word.length > 2 && contentLower.includes(word)) {
          matchCount++;
        }
      }

      const score = matchCount / queryWords.length;

      if (score >= threshold) {
        const document = this.documents.get(chunk.documentId);
        if (document) {
          results.push({
            memory: document,
            relevance: score,
            confidence: score,
            explanation: `Keyword match in chunk ${chunk.chunkIndex + 1}`,
            chunkRelevance: score,
            chunkIndex: chunk.chunkIndex,
            similarityScore: score
          });
        }
      }
    }

    return results;
  }

  private deduplicateDocumentResults(results: DocumentSearchResult[]): DocumentSearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = `${result.memory.id}-${result.chunkIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private rankDocumentResults(results: DocumentSearchResult[], query: string): DocumentSearchResult[] {
    return results.sort((a, b) => {
      // Combine relevance with additional ranking factors
      const aRank = a.relevance + this.calculateDocumentRelevance(a, query);
      const bRank = b.relevance + this.calculateDocumentRelevance(b, query);
      return bRank - aRank;
    });
  }

  private calculateDocumentRelevance(result: DocumentSearchResult, query: string): number {
    let relevance = 0;

    // Boost for exact matches
    if (result.memory.content.toLowerCase().includes(query.toLowerCase())) {
      relevance += 0.2;
    }

    // Boost for recent documents
    const daysOld = (Date.now() - result.memory.createdAt) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) relevance += 0.1; // Recent documents get boost

    // Boost for higher importance
    relevance += result.memory.importance * 0.1;

    return relevance;
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

  private calculateChunkImportance(chunk: string, index: number, totalChunks: number): number {
    let importance = 0.5; // Base importance

    // First and last chunks are often more important
    if (index === 0 || index === totalChunks - 1) {
      importance += 0.2;
    }

    // Longer chunks might be more important
    const lengthFactor = Math.min(chunk.length / 200, 0.2);
    importance += lengthFactor;

    return Math.min(importance, 1);
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateChunkId(): string {
    return `chunk_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}