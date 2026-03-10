import { afterEach, describe, expect, it } from "vitest"
import { Columnist, ColumnistDB } from "../columnist"
import { createDbName, destroyDatabase } from "./db-test-utils"

const docsSchema = {
  columns: {
    id: "number",
    title: "string",
    body: "string",
    createdAt: "date"
  },
  primaryKey: "id",
  searchableFields: ["title", "body"]
} as const

describe("Columnist search", () => {
  const databases: { name: string; instance?: ColumnistDB }[] = []

  afterEach(async () => {
    for (const entry of databases.splice(0)) {
      await destroyDatabase(entry.name, entry.instance)
    }
  })

  it("returns ranked results from the TF-IDF index", async () => {
    const name = createDbName("search")
    const db = await Columnist.init(name, {
      version: 1,
      schema: { documents: docsSchema }
    })
    databases.push({ name, instance: db })

    const createdAt = new Date()
    await db.insert({ title: "Offline-first research", body: "Building offline capable AI tools", createdAt }, "documents")
    await db.insert({ title: "Sync strategies", body: "Discusses sync adapters and offline workflows", createdAt }, "documents")
    await db.insert({ title: "Vector search", body: "Focuses on embeddings only", createdAt }, "documents")

    const results = await db.search("offline", { table: "documents", limit: 2 })

    expect(results).toHaveLength(2)
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
    expect(results.some(result => result.title.includes("Offline-first"))).toBe(true)
  })
})