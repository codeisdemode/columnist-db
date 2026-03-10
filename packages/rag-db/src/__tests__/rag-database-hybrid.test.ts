import { afterEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"

import { RAGDatabase } from "../rag-database"

describe("RAGDatabase hybrid search", () => {
  const instances: { name: string; db: RAGDatabase }[] = []

  afterEach(async () => {
    for (const entry of instances.splice(0)) {
      const raw = (entry.db as any).db
      if (raw?.db) {
        try {
          raw.db.close()
        } catch {
          // ignore close errors in cleanup
        }
      }
      await deleteIndexedDb(entry.name)
    }
  })

  it("returns semantic + keyword matches when using hybrid search", async () => {
    const name = `rag-hybrid-${randomUUID().split("-")[0]}`
    const ragDb = new RAGDatabase({ name, cacheDurationMs: 0, cacheMaxEntries: 5, searchStrategy: "hybrid" })
    instances.push({ name, db: ragDb })

    const alphaId = await ragDb.addDocument("Alpha notes about offline memory", { topic: "alpha" })
    await ragDb.addDocument("Beta entry describing sync adapters", { topic: "beta" })
    await ragDb.addDocument("Alpha Beta mixed document for combined context", { topic: "hybrid" })

    const results = await ragDb.search("alpha memory", { limit: 2 })

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(Number(results[0].document.metadata.documentId)).toBe(Number(alphaId))
    expect(results.some(result => result.document.content.includes("Alpha Beta"))).toBe(true)
    expect(results.every(result => typeof result.score === "number")).toBe(true)
  })
})

async function deleteIndexedDb(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Failed to delete IndexedDB instance"))
    request.onblocked = () => resolve()
  })
}
