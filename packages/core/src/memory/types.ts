// Memory AI Types and Interfaces

export interface MemoryRecord {
  id: number;
  content: string;
  timestamp: Date;
  importance: number; // 0-1 importance score
  category?: string;
  metadata?: Record<string, unknown>;
  vector?: Float32Array; // Semantic embedding
  accessCount: number; // How many times this memory has been accessed
  lastAccessed?: Date; // Last time this memory was recalled
  relatedMemories?: number[]; // IDs of related memories
  _related?: MemoryRecord[]; // Temporary field for related memory data
}

export interface MemoryQueryOptions {
  limit?: number;
  minImportance?: number;
  timeRange?: [Date, Date];
  category?: string;
  semanticSearch?: string;
  includeRelated?: boolean;
  sortBy?: 'relevance' | 'recency' | 'importance' | 'accessCount';
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