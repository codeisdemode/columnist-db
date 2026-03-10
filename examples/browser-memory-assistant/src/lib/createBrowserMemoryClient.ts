import { BasicEmbeddingProvider, Columnist, defineTable } from 'columnist-db-core'

const DB_NAME = 'browser-memory-assistant'
const EMBEDDING_DIMS = 128

const memoryTable = defineTable()
  .column('id', 'string')
  .column('content', 'string')
  .column('summary', 'string')
  .column('tags', 'json')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .primaryKey('id')
  .searchable('content', 'summary')
  .vector({ field: 'summary', dims: EMBEDDING_DIMS })
  .build()

let dbPromise: Promise<Awaited<ReturnType<typeof Columnist.init>>> | null = null
const embeddingProvider = new BasicEmbeddingProvider()

export async function getBrowserMemoryDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Columnist.init(DB_NAME, {
        version: 1,
        schema: {
          memories: memoryTable
        }
      })

      db.registerEmbedder('memories', async (text: string) => embeddingProvider.generateEmbedding(text))

      return db
    })()
  }

  return dbPromise
}
