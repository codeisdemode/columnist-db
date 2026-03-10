import { webcrypto } from 'node:crypto';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { BasicEmbeddingProvider, Columnist, defineTable } from '../packages/core/src/index';

if (!globalThis.indexedDB) {
  globalThis.indexedDB = indexedDB as unknown as IDBFactory;
}

if (!globalThis.IDBKeyRange) {
  globalThis.IDBKeyRange = IDBKeyRange as unknown as typeof IDBKeyRange;
}

if (!globalThis.crypto || !(globalThis.crypto as Crypto).subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}

if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    configurable: true
  });
}

if (!window.crypto || !(window.crypto as Crypto).subtle) {
  Object.defineProperty(window, 'crypto', {
    value: webcrypto as Crypto,
    configurable: true
  });
}

const EMBEDDING_DIMENSIONS = 128;
const DEFAULT_RECORD_COUNT = 250;
const DEFAULT_WARMUP_RUNS = 5;
const DEFAULT_MEASURED_RUNS = 25;

function getNumericArg(name: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;

  const value = Number(raw.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const papersTable = defineTable()
  .column('id', 'string')
  .column('title', 'string')
  .column('authors', 'string')
  .column('abstract', 'string')
  .column('publicationDate', 'date')
  .column('tags', 'string')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .primaryKey('id')
  .searchable('title', 'abstract', 'authors', 'tags')
  .vector({ field: 'abstract', dims: EMBEDDING_DIMENSIONS })
  .build();

function percentile(values: number[], ratio: number): number {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    minMs: sorted[0],
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
    meanMs: mean
  };
}

function createPaper(index: number) {
  const themes = [
    ['machine learning', 'neural networks', 'classification'],
    ['offline sync', 'browser storage', 'replication'],
    ['vector search', 'semantic retrieval', 'rag'],
    ['knowledge management', 'agent memory', 'local first'],
    ['database indexing', 'query planning', 'embeddings']
  ];
  const selected = themes[index % themes.length];
  const title = `Paper ${index} on ${selected[0]}`;
  const abstract = [
    `This paper studies ${selected[0]} in a local-first AI stack.`,
    `It compares ${selected[1]} strategies with deterministic browser-side execution.`,
    `The evaluation focuses on ${selected[2]}, query latency, and developer ergonomics.`,
    `Columnist benchmark sample ${index}.`
  ].join(' ');

  return {
    id: `paper-${index}`,
    title,
    authors: `Author ${index % 23}, Author ${(index + 7) % 23}`,
    abstract,
    publicationDate: new Date(`2025-01-${String((index % 28) + 1).padStart(2, '0')}`),
    tags: selected.join(', '),
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ durationMs: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  return { durationMs: performance.now() - start, result };
}

async function main() {
  const recordCount = getNumericArg('records', DEFAULT_RECORD_COUNT);
  const warmupRuns = getNumericArg('warmup', DEFAULT_WARMUP_RUNS);
  const measuredRuns = getNumericArg('runs', DEFAULT_MEASURED_RUNS);
  const provider = new BasicEmbeddingProvider();
  const dbName = `benchmark-${Date.now()}`;

  const initTiming = await timeAsync(async () =>
    Columnist.init(dbName, {
      version: 1,
      schema: {
        papers: papersTable
      }
    })
  );

  const db = initTiming.result;
  db.registerEmbedder('papers', (text: string) => provider.generateEmbedding(text));

  const inserts: number[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const sample = createPaper(index);
    const timing = await timeAsync(() => db.insert(sample, 'papers'));
    inserts.push(timing.durationMs);
  }

  const queries = [
    'machine learning latency',
    'offline sync browser storage',
    'semantic retrieval rag',
    'agent memory local first',
    'database indexing embeddings'
  ];

  for (let i = 0; i < warmupRuns; i += 1) {
    const query = queries[i % queries.length];
    await db.search(query, { table: 'papers', limit: 5 });
  }

  const searchSamples: number[] = [];
  const resultSizes: number[] = [];
  for (let i = 0; i < measuredRuns; i += 1) {
    const query = queries[i % queries.length];
    const timing = await timeAsync(() => db.search(query, { table: 'papers', limit: 5 }));
    searchSamples.push(timing.durationMs);
    resultSizes.push(timing.result.length);
  }

  const getAllTiming = await timeAsync(() => db.getAll('papers'));

  console.log(
    JSON.stringify(
      {
        environment: 'node + fake-indexeddb',
        recordCount,
        warmupRuns,
        measuredRuns,
        init: {
          initMs: initTiming.durationMs
        },
        insert: summarize(inserts),
        search: {
          ...summarize(searchSamples),
          averageResultCount: resultSizes.reduce((sum, size) => sum + size, 0) / resultSizes.length
        },
        fullScan: {
          getAllMs: getAllTiming.durationMs,
          rowCount: getAllTiming.result.length
        }
      },
      null,
      2
    )
  );

  process.exit(0);
}

void main();
