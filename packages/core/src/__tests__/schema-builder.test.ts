import { describe, expect, it } from "vitest"
import { z } from "zod"
import { defineTable } from "../columnist"

describe("TableSchemaBuilder", () => {
  it("builds schemas with indexes, validation, and vector config", () => {
    const contentSchema = z.object({
      id: z.number(),
      title: z.string().min(1),
      content: z.string().min(1),
      metadata: z.object({ tags: z.array(z.string()).default([]) }),
      createdAt: z.date()
    })

    const builder = defineTable()
      .column("id", "number")
      .column("title", "string")
      .column("content", "string")
      .column("metadata", "json")
      .column("createdAt", "date")
      .primaryKey("id")
      .searchable("title", "content")
      .indexes("createdAt")
      .vector({ field: "content", dims: 8 })

    const definition = builder.build()

    expect(definition.columns).toMatchObject({
      id: "number",
      title: "string",
      content: "string",
      metadata: "json",
      createdAt: "date"
    })
    expect(definition.primaryKey).toBe("id")
    expect(definition.searchableFields).toEqual(["title", "content"])
    expect(definition.secondaryIndexes).toEqual(["createdAt"])
    expect(definition.vector).toEqual({ field: "content", dims: 8 })

    const validationBuilder = defineTable()
      .column("id", "number")
      .column("title", "string")
      .column("content", "string")
      .column("metadata", "json")
      .column("createdAt", "date")
      .validate(contentSchema)

    const validatedDefinition = validationBuilder.build()
    expect(validatedDefinition.validation).toBe(contentSchema)

    const codec = builder.codec()
    const now = new Date()
    const encoded = codec.encode({
      id: 1,
      title: "Doc",
      content: "Body",
      metadata: { tags: ["test"] },
      createdAt: now
    })

    expect(encoded.metadata).toBe(JSON.stringify({ tags: ["test"] }))

    const decodedFromDate = codec.decode({
      id: 2,
      title: "Doc 2",
      content: "Body",
      metadata: JSON.stringify({ tags: ["decode"] }),
      createdAt: now
    })
    expect(decodedFromDate.createdAt).toBeInstanceOf(Date)
    expect(decodedFromDate.metadata).toEqual({ tags: ["decode"] })

    const decodedFromString = codec.decode({
      id: 3,
      title: "Doc 3",
      content: "Body",
      metadata: JSON.stringify({ tags: ["string"] }),
      createdAt: now.toISOString()
    })
    expect(decodedFromString.createdAt).toBeInstanceOf(Date)
    expect(decodedFromString.metadata).toEqual({ tags: ["string"] })
  })
})
