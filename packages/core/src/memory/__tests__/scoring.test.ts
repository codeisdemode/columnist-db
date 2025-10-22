import { describe, expect, it, beforeEach } from 'vitest'
import { MemoryScoring } from '../scoring'
import type { MemoryRecord } from '../types'

describe('MemoryScoring', () => {
  let scoring: MemoryScoring
  let now: number

  const makeMemory = (overrides: Partial<MemoryRecord> = {}): MemoryRecord => {
    const base: MemoryRecord = {
      id: 'memory-1',
      content: 'Test content about building better memory systems for assistants.',
      contentType: 'text',
      vector: [0.1, 0.2, 0.3],
      metadata: { topic: 'ai', tags: ['assistant', 'memory'] },
      importance: 0.4,
      accessCount: 0,
      lastAccessed: now - 60 * 1000,
      createdAt: now - 2 * 60 * 60 * 1000,
      updatedAt: now - 60 * 1000,
      category: 'general',
      tags: ['memory', 'assistant']
    }

    return { ...base, ...overrides }
  }

  beforeEach(() => {
    scoring = new MemoryScoring()
    now = Date.now()
  })

  it('prefers memories with higher semantic similarity', () => {
    const memory = makeMemory()

    const lowSimilarity = scoring.calculateRelevanceScore(memory, {
      similarity: 0.2,
      now
    })
    const highSimilarity = scoring.calculateRelevanceScore(memory, {
      similarity: 0.85,
      now
    })

    expect(highSimilarity).toBeGreaterThan(lowSimilarity)
  })

  it('deprioritises stale memories compared to fresh ones', () => {
    const stale = makeMemory({
      id: 'memory-stale',
      lastAccessed: now - 7 * 24 * 60 * 60 * 1000,
      updatedAt: now - 7 * 24 * 60 * 60 * 1000
    })
    const recent = makeMemory({
      id: 'memory-recent',
      lastAccessed: now - 5 * 60 * 1000,
      updatedAt: now - 5 * 60 * 1000
    })

    const staleScore = scoring.calculateRelevanceScore(stale, {
      similarity: 0.5,
      now
    })
    const recentScore = scoring.calculateRelevanceScore(recent, {
      similarity: 0.5,
      now
    })

    expect(recentScore).toBeGreaterThan(staleScore)
  })

  it('boosts importance as access frequency increases', () => {
    const baseline = makeMemory({
      id: 'memory-frequency',
      accessCount: 0,
      importance: 0.2
    })

    const initialImportance = scoring.calculateImportanceScore(baseline, { now })
    const reinforced = scoring.updateMemoryScores(baseline, {
      now,
      accessDelta: 6
    })

    expect(reinforced.accessCount).toBe(6)
    expect(reinforced.importance).toBeGreaterThan(initialImportance)
  })

  it('applies strong boosts for pinned memories', () => {
    const pinned = makeMemory({
      id: 'memory-pinned',
      metadata: { pinned: true, priority: 'high' },
      tags: ['pinned', 'summary']
    })
    const regular = makeMemory({
      id: 'memory-regular'
    })

    const pinnedImportance = scoring.calculateImportanceScore(pinned, { now })
    const regularImportance = scoring.calculateImportanceScore(regular, { now })
    expect(pinnedImportance).toBeGreaterThan(regularImportance)
    expect(pinnedImportance).toBeCloseTo(1, 1)

    const pinnedRelevance = scoring.calculateRelevanceScore(pinned, {
      similarity: 0.1,
      now
    })
    const regularRelevance = scoring.calculateRelevanceScore(regular, {
      similarity: 0.1,
      now
    })
    expect(pinnedRelevance).toBeGreaterThan(regularRelevance)
  })
})
