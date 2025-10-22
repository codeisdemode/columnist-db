import type { MemoryRecord } from './types'

const LN2 = Math.log(2)

export interface MemoryScoringWeights {
  semantic: number
  importance: number
  recency: number
  frequency: number
  metadata: number
}

export interface MemoryImportanceWeights {
  base: number
  length: number
  recency: number
  frequency: number
  metadata: number
}

export interface MemoryScoringConfig {
  /** Relative weights that make up the final relevance score */
  relevanceWeights: MemoryScoringWeights
  /** Relative weights that drive the underlying importance score */
  importanceWeights: MemoryImportanceWeights
  /** Half-life used when calculating how much recency should influence relevance */
  recencyHalfLifeMs: number
  /** Half-life used when decaying importance over time */
  importanceHalfLifeMs: number
  /** Number of accesses required before frequency is considered "saturated" */
  frequencySaturation: number
  /** Character count that maps to a "full" length contribution */
  lengthNormalization: number
  /** Boost applied to relevance when a memory is pinned */
  pinnedRelevanceBoost: number
  /** Boost applied to importance when a memory is pinned */
  pinnedImportanceBoost: number
  /** Additional boost applied when metadata marks a memory as high priority */
  metadataImportanceBoost: number
  /** Fallback similarity value when none is provided */
  defaultSimilarity: number
  /** Minimum and maximum relevance bounds */
  minRelevance: number
  maxRelevance: number
  /** Minimum and maximum importance bounds */
  minImportance: number
  maxImportance: number
}

export interface MemoryRelevanceContext {
  similarity?: number
  now?: number
  query?: string
  queryTags?: string[]
  boost?: number
}

export interface MemoryImportanceContext {
  now?: number
  manualBoost?: number
}

export interface MemoryUpdateContext extends MemoryImportanceContext {
  /** How many additional accesses should be recorded */
  accessDelta?: number
  /** Override for the last accessed timestamp */
  lastAccessed?: number
  /** Whether the memory should be pinned/unpinned */
  pinned?: boolean
  /** Additional metadata to merge into the record */
  metadata?: Record<string, unknown>
  /** Optional query tags so relevance can be recalculated immediately */
  queryTags?: string[]
}

const DEFAULT_CONFIG: MemoryScoringConfig = {
  relevanceWeights: {
    semantic: 0.45,
    importance: 0.25,
    recency: 0.15,
    frequency: 0.1,
    metadata: 0.05
  },
  importanceWeights: {
    base: 0.2,
    length: 0.25,
    recency: 0.25,
    frequency: 0.15,
    metadata: 0.15
  },
  recencyHalfLifeMs: 12 * 60 * 60 * 1000, // 12 hours
  importanceHalfLifeMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  frequencySaturation: 15,
  lengthNormalization: 600,
  pinnedRelevanceBoost: 0.2,
  pinnedImportanceBoost: 0.3,
  metadataImportanceBoost: 0.2,
  defaultSimilarity: 0,
  minRelevance: 0,
  maxRelevance: 1,
  minImportance: 0.05,
  maxImportance: 1
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function mergeConfig(config: Partial<MemoryScoringConfig>): MemoryScoringConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    relevanceWeights: {
      ...DEFAULT_CONFIG.relevanceWeights,
      ...(config.relevanceWeights ?? {})
    },
    importanceWeights: {
      ...DEFAULT_CONFIG.importanceWeights,
      ...(config.importanceWeights ?? {})
    }
  }
}

function toArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map(String)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
  }
  return [String(value)]
}

export class MemoryScoring {
  private config: MemoryScoringConfig

  constructor(config: Partial<MemoryScoringConfig> = {}) {
    this.config = mergeConfig(config)
  }

  getConfig(): MemoryScoringConfig {
    return JSON.parse(JSON.stringify(this.config))
  }

  setConfig(config: Partial<MemoryScoringConfig>): void {
    this.config = mergeConfig({ ...this.config, ...config })
  }

  calculateRelevanceScore(memory: MemoryRecord, context: MemoryRelevanceContext = {}): number {
    const similarity = context.similarity ?? this.config.defaultSimilarity
    const now = context.now ?? Date.now()

    const recencySignal = this.recencyMultiplier(now - (memory.lastAccessed ?? memory.createdAt), this.config.recencyHalfLifeMs)
    const frequencySignal = this.frequencyMultiplier(memory.accessCount)
    const metadataSignal = this.metadataSignal(memory, context.queryTags)

    const weights = this.config.relevanceWeights
    const totalWeight = weights.semantic + weights.importance + weights.recency + weights.frequency + weights.metadata

    let score =
      (similarity * weights.semantic +
        memory.importance * weights.importance +
        recencySignal * weights.recency +
        frequencySignal * weights.frequency +
        metadataSignal * weights.metadata) /
      totalWeight

    if (this.isPinned(memory)) {
      score += this.config.pinnedRelevanceBoost
    }

    if (context.boost) {
      score += context.boost
    }

    return clamp(score, this.config.minRelevance, this.config.maxRelevance)
  }

  calculateImportanceScore(memory: MemoryRecord, context: MemoryImportanceContext = {}): number {
    if (this.isPinned(memory)) {
      return this.config.maxImportance
    }

    const now = context.now ?? Date.now()
    const weights = this.config.importanceWeights

    const lengthSignal = Math.tanh(memory.content.length / this.config.lengthNormalization)
    const recencySignal = this.recencyMultiplier(now - (memory.lastAccessed ?? memory.createdAt), this.config.importanceHalfLifeMs)
    const frequencySignal = this.frequencyMultiplier(memory.accessCount)
    const metadataSignal = this.metadataImportanceSignal(memory)

    let importance =
      weights.base +
      lengthSignal * weights.length +
      recencySignal * weights.recency +
      frequencySignal * weights.frequency +
      metadataSignal * weights.metadata

    if (context.manualBoost) {
      importance += context.manualBoost
    }

    if (this.isPinned(memory)) {
      importance += this.config.pinnedImportanceBoost
    }

    return clamp(importance, this.config.minImportance, this.config.maxImportance)
  }

  updateMemoryScores(memory: MemoryRecord, context: MemoryUpdateContext = {}): MemoryRecord {
    const now = context.now ?? Date.now()
    const accessDelta = context.accessDelta ?? 0
    const metadata = context.metadata ? { ...(memory.metadata ?? {}), ...context.metadata } : memory.metadata

    const updated: MemoryRecord = {
      ...memory,
      metadata,
      accessCount: Math.max(0, memory.accessCount + accessDelta),
      lastAccessed: context.lastAccessed ?? (accessDelta > 0 ? now : memory.lastAccessed),
      updatedAt: now
    }

    if (context.pinned !== undefined) {
      updated.metadata = { ...(updated.metadata ?? {}), pinned: context.pinned }
    }

    updated.importance = this.calculateImportanceScore(updated, context)

    return updated
  }

  private recencyMultiplier(ageMs: number, halfLife: number): number {
    if (!halfLife || halfLife <= 0) {
      return 1
    }
    if (ageMs <= 0) {
      return 1
    }

    return Math.exp((-LN2 * ageMs) / halfLife)
  }

  private frequencyMultiplier(accessCount: number): number {
    if (accessCount <= 0) {
      return 0
    }

    const saturation = Math.max(1, this.config.frequencySaturation)
    return 1 - Math.exp(-Math.max(0, accessCount) / saturation)
  }

  private metadataSignal(memory: MemoryRecord, queryTags: string[] = []): number {
    const metadata = memory.metadata ?? {}
    let score = 0

    if (this.isPinned(memory)) {
      score += 1
    }

    if (typeof metadata.importance === 'number') {
      score += clamp(metadata.importance, 0, 1)
    }

    const priority = typeof metadata.priority === 'string' ? metadata.priority.toLowerCase() : null
    if (priority === 'high') {
      score += 1
    } else if (priority === 'medium') {
      score += 0.5
    }

    const tags = new Set<string>(
      [...toArray(metadata.tags), ...toArray(memory.tags)].map(tag => tag.toLowerCase())
    )

    if (queryTags.length > 0 && tags.size > 0) {
      const matches = queryTags.filter(tag => tags.has(tag.toLowerCase())).length
      if (matches > 0) {
        score += matches / queryTags.length
      }
    }

    return clamp(score, 0, 1)
  }

  private metadataImportanceSignal(memory: MemoryRecord): number {
    const metadata = memory.metadata ?? {}
    let signal = 0

    if (this.isPinned(memory)) {
      signal += this.config.metadataImportanceBoost
    }

    if (typeof metadata.importance === 'number') {
      signal += clamp(metadata.importance, 0, 1)
    }

    const priority = typeof metadata.priority === 'string' ? metadata.priority.toLowerCase() : undefined
    if (priority === 'critical' || priority === 'urgent') {
      signal += this.config.metadataImportanceBoost
    } else if (priority === 'high') {
      signal += this.config.metadataImportanceBoost * 0.75
    } else if (priority === 'medium') {
      signal += this.config.metadataImportanceBoost * 0.5
    }

    if (metadata.recencyBoost === true) {
      signal += 0.25
    }

    return clamp(signal, 0, 1)
  }

  private isPinned(memory: MemoryRecord): boolean {
    if (memory.metadata && typeof memory.metadata === 'object' && 'pinned' in memory.metadata) {
      return Boolean((memory.metadata as Record<string, unknown>).pinned)
    }

    return Array.isArray(memory.tags) && memory.tags.some(tag => tag.toLowerCase() === 'pinned')
  }
}
