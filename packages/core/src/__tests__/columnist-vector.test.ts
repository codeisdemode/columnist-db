import { afterEach, describe, expect, it } from "vitest"
import { Columnist, ColumnistDB } from "../columnist"
import { createDbName, destroyDatabase } from "./db-test-utils"

type DocRecord = { id: number; title: string }

const vectorSchema = {
  columns: {
    id: "number",
    title: "string"
  },
  primaryKey: "id",
  searchableFields: ["title"],
  vector: {
    field: "title",
    dims: 3
  }
} as const

describe("Columnist vector search", () => {
  const databases: { name: string; instance?: ColumnistDB }[] = []

  afterEach(async () => {
    for (const entry of databases.splice(0)) {
      await destroyDatabase(entry.name, entry.instance)
    }
  })

  it("returns nearest neighbors from registered embedder", async () => {
    const name = createDbName("vector-search")
    const db = await Columnist.init(name, {
      version: 1,
      schema: { docs: vectorSchema }
    })
    databases.push({ name, instance: db })

    db.registerEmbedder("docs", async text => pseudoEmbedding(text))

    await db.insert({ title: "Alpha memo" }, "docs")
    await db.insert({ title: "Beta update" }, "docs")
    await db.insert({ title: "Alpha Beta mix" }, "docs")

    const queryVector = pseudoEmbedding("alpha insights")
    const results = await db.vectorSearch<DocRecord>("docs", queryVector, {
      limit: 2,
      useHNSW: false,
      useIVF: false
    })

    expect(results).toHaveLength(2)
    expect(results[0].title).toContain("Alpha memo")
    expect(results[1].title).toContain("Alpha Beta mix")
    expect(results.every(r => typeof r.score === "number")).toBe(true)
  })

  it("rejects vectors with mismatched dimensions", async () => {
    const name = createDbName("vector-dims")
    const db = await Columnist.init(name, {
      version: 1,
      schema: { docs: vectorSchema }
    })
    databases.push({ name, instance: db })

    await expect(
      db.vectorSearch("docs", new Float32Array([1, 0]), { limit: 1 })
    ).rejects.toThrow(/Vector dimension mismatch/)
  })
})

function pseudoEmbedding(text: string): Float32Array {
  const lower = text.toLowerCase()
  const vector = new Float32Array(3)
  if (lower.includes("alpha")) vector[0] = 1
  if (lower.includes("beta")) vector[1] = 1
  if (lower.includes("gamma")) vector[2] = 1
  if (vector[0] === 0 && vector[1] === 0 && vector[2] === 0) {
    vector[2] = 1
  }
  return vector
}
