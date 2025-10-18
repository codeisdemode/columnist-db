"use client"

import { z } from "zod"
import { defineTable, type InferTableType } from "./columnist"

// Example 1: Basic schema with auto-validation
export const messagesTable = defineTable()
  .column("id", "number")
  .column("user_id", "number")
  .column("content", "string")
  .column("timestamp", "date")
  .column("edited", "boolean")
  .primaryKey("id")
  .searchable("content")
  .indexes("user_id", "timestamp")
  .build()

// Example 2: Advanced schema with custom validation
export const usersTable = defineTable()
  .column("id", "number")
  .column("email", "string")
  .column("name", "string")
  .column("age", "number")
  .column("metadata", "json")
  .column("created_at", "date")
  .primaryKey("id")
  .searchable("name", "email")
  .indexes("email", "created_at")
  .validate(z.object({
    id: z.number().optional(),
    email: z.string().email("Invalid email format"),
    name: z.string().min(2, "Name must be at least 2 characters"),
    age: z.number().min(13, "Must be at least 13 years old").max(120, "Age must be realistic"),
    metadata: z.record(z.unknown()).optional(),
    created_at: z.date().optional().default(() => new Date())
  }))
  .build()

// Example 3: Product catalog with complex validation
export const productsTable = defineTable()
  .column("id", "number")
  .column("name", "string")
  .column("description", "string")
  .column("price", "number")
  .column("category", "string")
  .column("tags", "json")
  .column("in_stock", "boolean")
  .column("created_at", "date")
  .primaryKey("id")
  .searchable("name", "description")
  .indexes("category", "price", "in_stock")
  .validate(z.object({
    id: z.number().optional(),
    name: z.string().min(1, "Product name is required"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    price: z.number().positive("Price must be positive"),
    category: z.enum(["electronics", "clothing", "books", "home", "other"]),
    tags: z.array(z.string()).default([]),
    in_stock: z.boolean().default(true),
    created_at: z.date().default(() => new Date())
  }))
  .build()

// Type-safe schema definition
export const appSchema = {
  messages: messagesTable,
  users: usersTable,
  products: productsTable
} as const

// Infer TypeScript types from schema
export type MessageType = InferTableType<typeof messagesTable>
export type UserType = InferTableType<typeof usersTable>
export type ProductType = InferTableType<typeof productsTable>

// Usage examples with type safety:

/*
// Initialize with schema
const db = await Columnist.init("my-app", { schema: appSchema })
const typed = db.typed<typeof appSchema>()

// Type-safe inserts
await typed.insert({
  email: "user@example.com",
  name: "John Doe", 
  age: 25,
  metadata: { role: "admin" }
}, "users")

// Type-safe queries
const users = await typed.find({
  table: "users",
  where: { age: { $gte: 18 } },
  orderBy: "created_at"
})

// Type-safe search
const products = await typed.search("laptop", {
  table: "products",
  category: "electronics"
})

// TypeScript will catch errors:
await typed.insert({
  email: "invalid-email", // Validation error: Invalid email format
  name: "A", // Validation error: Name must be at least 2 characters
  age: 12   // Validation error: Must be at least 13 years old
}, "users")
*/
