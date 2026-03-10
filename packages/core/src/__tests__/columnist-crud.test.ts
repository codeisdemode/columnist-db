import { afterEach, describe, expect, it } from "vitest"
import { Columnist, ColumnistDB } from "../columnist"
import { createDbName, destroyDatabase } from "./db-test-utils"

const notesSchema = {
  columns: {
    id: "number",
    title: "string",
    body: "string",
    createdAt: "date"
  },
  primaryKey: "id",
  searchableFields: ["title", "body"]
} as const

describe("Columnist CRUD", () => {
  const databases: { name: string; instance?: ColumnistDB }[] = []

  afterEach(async () => {
    for (const entry of databases.splice(0)) {
      await destroyDatabase(entry.name, entry.instance)
    }
  })

  it("creates, reads, updates, and deletes rows", async () => {
    const name = createDbName("crud")
    const db = await Columnist.init(name, {
      version: 1,
      schema: {
        notes: notesSchema
      }
    })
    databases.push({ name, instance: db })

    const createdAt = new Date()
    const first = await db.insert({ title: "First", body: "Hello world", createdAt }, "notes")
    const second = await db.insert({ title: "Second", body: "Hola mundo", createdAt }, "notes")

    expect(first.id).toBeGreaterThan(0)
    expect(second.id).toBeGreaterThan(first.id)

    const allNotes = await db.getAll("notes", 10)
    expect(allNotes).toHaveLength(2)

    await db.update(first.id, { title: "First (edited)" }, "notes")
    const updated = await db.find({ table: "notes", where: { id: first.id } })
    expect(updated[0].title).toBe("First (edited)")

    await db.delete(second.id, "notes")
    const remaining = await db.getAll("notes", 10)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(first.id)
  })
})
