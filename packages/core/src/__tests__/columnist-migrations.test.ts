import { afterEach, describe, expect, it, vi } from "vitest"
import { Columnist, ColumnistDB } from "../columnist"
import { createDbName, destroyDatabase } from "./db-test-utils"

const v1Schema = {
  columns: {
    id: "number",
    title: "string",
    body: "string"
  },
  primaryKey: "id",
  searchableFields: ["title"]
} as const

const v2Schema = {
  columns: {
    id: "number",
    title: "string",
    body: "string",
    summary: "string"
  },
  primaryKey: "id",
  searchableFields: ["title", "summary"]
} as const

describe("Columnist migrations", () => {
  const databases: { name: string; instance?: ColumnistDB }[] = []

  afterEach(async () => {
    for (const entry of databases.splice(0)) {
      await destroyDatabase(entry.name, entry.instance)
    }
  })

  it("runs registered migration steps during version upgrades", async () => {
    const name = createDbName("migration")
    const dbV1 = await Columnist.init(name, { version: 1, schema: { notes: v1Schema } })
    databases.push({ name, instance: dbV1 })

    await dbV1.insert({ title: "Before", body: "Legacy" }, "notes")

    const rawDb = (dbV1 as unknown as { db?: IDBDatabase }).db
    rawDb?.close()

    const migration = vi.fn((database: IDBDatabase, _tx: IDBTransaction, oldVersion: number) => {
      expect(oldVersion).toBe(1)
      if (!database.objectStoreNames.contains("legacy")) {
        database.createObjectStore("legacy", { keyPath: "id", autoIncrement: true })
      }
    })

    const dbV2 = await Columnist.init(name, {
      version: 2,
      schema: { notes: v2Schema },
      migrations: {
        2: migration
      }
    })
    databases[0].instance = dbV2

    expect(migration).toHaveBeenCalledTimes(1)
    const migrated = await dbV2.getAll("notes", 10)
    expect(migrated).toHaveLength(1)
    expect(migrated[0].title).toBe("Before")
  })
})
