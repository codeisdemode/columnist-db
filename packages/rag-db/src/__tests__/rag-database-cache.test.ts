import { describe, it, expect, vi, afterEach } from 'vitest';
import { Columnist } from 'columnist-db-core';

import { RAGDatabase } from '../rag-database';

const createResult = (query: string) => ({
  id: query.length,
  documentId: query.length,
  content: `Document about ${query}`,
  metadata: { documentId: query.length },
  createdAt: new Date(),
  updatedAt: new Date(),
  score: 0.9,
});

describe('RAGDatabase caching behaviour', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces cache limits and counts cache hits', async () => {
    const ragDb = new RAGDatabase({ cacheDurationMs: 60_000, cacheMaxEntries: 2 });

    (ragDb as any).initialize = vi.fn().mockResolvedValue(undefined);
    (ragDb as any).db = {
      vectorSearchText: vi.fn().mockImplementation(async (_table: string, query: string) => [createResult(query)]),
      search: vi.fn().mockResolvedValue([]),
    };

    await ragDb.search('alpha', { limit: 1 });
    await ragDb.search('beta', { limit: 1 });

    let cacheKeys = Array.from((ragDb as any).queryCache.keys()).join(' ');
    expect(cacheKeys).toContain('"alpha"');
    expect(cacheKeys).toContain('"beta"');

    await ragDb.search('gamma', { limit: 1 });
    cacheKeys = Array.from((ragDb as any).queryCache.keys()).join(' ');
    expect(cacheKeys).not.toContain('"alpha"');
    expect(cacheKeys).toContain('"beta"');
    expect(cacheKeys).toContain('"gamma"');

    const vectorSearch = (ragDb as any).db.vectorSearchText as ReturnType<typeof vi.fn>;
    expect(vectorSearch).toHaveBeenCalledTimes(3);

    await ragDb.search('beta', { limit: 1 });
    await ragDb.search('gamma', { limit: 1 });

    expect(vectorSearch).toHaveBeenCalledTimes(3);

    const metrics = (ragDb as any).metrics;
    expect(metrics.totalQueries).toBe(5);
    expect(metrics.cacheHits).toBe(2);

    expect((ragDb as any).queryCache.size).toBeLessThanOrEqual(2);
  });

  it('uses the provided embedding provider when initialising', async () => {
    const customProvider = {
      generateEmbedding: vi.fn(),
      getDimensions: () => 42,
      getModel: () => 'custom-model',
    };

    const registerEmbedder = vi.fn();
    const initMock = vi
      .spyOn(Columnist, 'init')
      .mockResolvedValue({ registerEmbedder, getOptions: () => ({ sync: { enabled: false } }) } as any);

    const ragDb = new RAGDatabase({ embeddingProvider: customProvider });
    (ragDb as any).initializeSync = vi.fn().mockResolvedValue(undefined);

    await (ragDb as any).setupDatabase();

    expect(initMock).toHaveBeenCalledTimes(1);
    const [, options] = initMock.mock.calls[0];
    expect(options?.schema?.chunks?.vector?.dims).toBe(42);
    expect((ragDb as any).embeddingProvider).toBe(customProvider);
    expect(registerEmbedder).toHaveBeenCalledWith('chunks', expect.any(Function));
  });
});
