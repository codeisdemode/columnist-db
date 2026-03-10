import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { BasicEmbeddingProvider, Columnist, defineTable } from 'columnist-db-core'
import { addMemoryTool } from './tools/addMemory'
import { searchMemoriesTool } from './tools/searchMemories'

const memoryTable = defineTable()
  .column('id', 'string')
  .column('content', 'string')
  .column('summary', 'string')
  .column('tags', 'json')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .primaryKey('id')
  .searchable('content', 'summary')
  .vector({ field: 'summary', dims: 128 })
  .build()

async function bootstrap() {
  const embeddingProvider = new BasicEmbeddingProvider()
  const db = await Columnist.init('mcp-memory-server', {
    version: 1,
    schema: {
      memories: memoryTable
    }
  })

  db.registerEmbedder('memories', async (text: string) => embeddingProvider.generateEmbedding(text))

  const rl = createInterface({ input: stdin, output: stdout })
  stdout.write('[mcp-memory-server] Ready for JSON-RPC commands. Type `exit` to quit.\n')
  stdout.write(`[mcp-memory-server] Embedding provider: ${embeddingProvider.getModel()}\n`)

  for await (const line of rl) {
    if (!line.trim()) continue
    if (line.trim().toLowerCase() === 'exit') {
      rl.close()
      process.exit(0)
    }

    try {
      const payload = JSON.parse(line)
      const { tool, params } = payload

      if (tool === 'add_memory') {
        const result = await addMemoryTool(db, params)
        stdout.write(JSON.stringify({ ok: true, result }) + '\n')
      } else if (tool === 'search_memory') {
        const result = await searchMemoriesTool(db, params)
        stdout.write(JSON.stringify({ ok: true, result }) + '\n')
      } else {
        stdout.write(JSON.stringify({ ok: false, error: `Unknown tool ${tool}` }) + '\n')
      }
    } catch (error) {
      stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }) + '\n')
    }
  }
}

bootstrap().catch(error => {
  console.error('[mcp-memory-server] Failed to start', error)
  process.exit(1)
})
