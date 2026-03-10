import type { ColumnistDB } from 'columnist-db-core'
import { z } from 'zod'

const paramsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(10).default(5)
})

export async function searchMemoriesTool(db: ColumnistDB, rawParams: unknown) {
  const { query, limit } = paramsSchema.parse(rawParams)
  const results = await db.search(query, { table: 'memories', limit })
  return results.map((result) => ({
    id: result.id,
    summary: 'summary' in result ? result.summary : undefined,
    score: result.score
  }))
}
