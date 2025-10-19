// Memory Manager with AI capabilities
// Implements vector embeddings, semantic search, and memory consolidation

import * as crypto from 'crypto';

export interface MemoryRecord {
  id: string;
  content: string;
  contentType: string;
  vector: number[]; // Embedding vector
  metadata?: any;
  importance: number; // 0-1 importance score
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
  updatedAt: number;
  category?: string;
  tags?: string[];
}

export interface SearchResult {
  memory: MemoryRecord;
  relevance: number; // 0-1 relevance score
  similarity: number; // Cosine similarity
}

export interface MemoryQueryOptions {
  limit?: number;
  minImportance?: number;
  category?: string;
  tags?: string[];
  semanticSearch?: string;
  includeRelated?: boolean;
}

export class MemoryManager {
  private memories = new Map<string, MemoryRecord>();
  private vectorIndex: Map<string, number[]> = new Map();
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
}