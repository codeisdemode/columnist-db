// Memory AI Types and Interfaces

export interface MemoryRecord {
  id: string;
  content: string;
  contentType?: string;
  vector: number[]; // Semantic embedding
  metadata?: any;
  importance: number; // 0-1 importance score
  accessCount: number; // How many times this memory has been accessed
  lastAccessed: number; // Last time this memory was recalled (timestamp)
  createdAt: number; // Creation timestamp
  updatedAt: number; // Last update timestamp
  category?: string;
  tags?: string[];
}

export interface MemoryQueryOptions {
  limit?: number;
  minImportance?: number;
  timeRange?: [Date, Date];
  category?: string;
  semanticSearch?: string;
  includeRelated?: boolean;
  sortBy?: 'relevance' | 'recency' | 'importance' | 'accessCount';
  tags?: string[];
}

export interface MemoryImportanceScore {
  contentLength: number; // Longer content tends to be more important
  semanticRichness: number; // How information-dense the content is
  temporalRecency: number; // More recent memories are more important
  accessFrequency: number; // Frequently accessed memories are more important
  contextualRelevance: number; // How relevant to current context
}

export interface MemorySearchResult {
  memory: MemoryRecord;
  relevance: number; // 0-1 relevance score for the query
  confidence: number; // 0-1 confidence in the result
  explanation: string; // Human-readable explanation of why this memory was retrieved
}

export interface SearchResult {
  memory: MemoryRecord;
  relevance: number;
  similarity: number;
}

export interface MemoryContext {
  currentTopic?: string;
  recentMemories?: MemoryRecord[];
  userPreferences?: Record<string, unknown>;
  temporalContext?: {
    timeOfDay?: string;
    dayOfWeek?: string;
    season?: string;
  };
}

export interface MemoryConsolidationConfig {
  retentionThreshold: number; // Minimum importance to keep (0-1)
  compressionRatio: number; // How much to compress medium importance memories (0-1)
  temporalDecayRate: number; // Rate at which importance decays over time (0-1)
  maxMemoryCount: number; // Maximum number of memories to keep
}

// Document Processing Types
export interface DocumentRecord extends MemoryRecord {
  chunks?: DocumentChunk[];
  chunkingStrategy?: 'semantic' | 'fixed' | 'recursive';
  originalLength?: number;
  chunkCount?: number;
  documentType?: string;
  timestamp: Date;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, any>;
  chunkIndex: number;
  vector?: Float32Array;
  createdAt: Date;
  importance?: number;
  accessCount?: number;
  lastAccessed?: Date;
}

export interface DocumentSearchOptions extends MemoryQueryOptions {
  includeHighlights?: boolean;
  searchStrategy?: 'hybrid' | 'semantic' | 'keyword';
  chunkingStrategy?: 'semantic' | 'fixed' | 'recursive';
  maxChunkSize?: number;
  similarityThreshold?: number;
}

export interface DocumentSearchResult extends MemorySearchResult {
  highlights?: string[];
  chunkRelevance?: number;
  documentContext?: string;
  chunkIndex?: number;
  similarityScore?: number;
}

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<Float32Array>;
  getDimensions(): number;
  getModel(): string;
}

export interface DocumentProcessingOptions {
  chunkingStrategy?: 'semantic' | 'fixed' | 'recursive';
  maxChunkSize?: number;
  minChunkSize?: number;
  preserveStructure?: boolean;
  generateEmbeddings?: boolean;
}