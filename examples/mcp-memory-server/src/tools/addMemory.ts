import { randomUUID } from 'node:crypto'
import type { ColumnistDB } from 'columnist-db-core'
import { z } from 'zod'

const payloadSchema = z.object({
  content: z.string().min(1),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([])
})

export async function addMemoryTool(db: ColumnistDB, rawParams: unknown) {
  const { content, summary, tags } = payloadSchema.parse(rawParams)
  const now = new Date()
  const doc = {
    id: randomUUID(),
    content,
    summary: summary ?? content.slice(0, 280),
    tags,
    createdAt: now,
    updatedAt: now
  }

  await db.insert(doc, 'memories')
  return doc
}
