import { defineTable } from 'columnist-db-core';
import { z } from 'zod';

export const notesSchema = defineTable()
  .column('id', 'number')
  .column('title', 'string')
  .column('content', 'string')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .column('tags', 'json')
  .column('category', 'string')
  .primaryKey('id')
  .searchable('title', 'content', 'category')
  .indexes('createdAt', 'updatedAt', 'category')
  .validate(z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date()),
    tags: z.array(z.string()).optional(),
    category: z.string().optional()
  }))
  .build();