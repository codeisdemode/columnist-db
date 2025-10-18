import { defineTable } from 'columnist-db-core';
import { z } from 'zod';

export const tasksSchema = defineTable()
  .column('id', 'number')
  .column('title', 'string')
  .column('description', 'string')
  .column('dueDate', 'date')
  .column('priority', 'string')
  .column('status', 'string')
  .column('createdAt', 'date')
  .column('updatedAt', 'date')
  .column('tags', 'json')
  .primaryKey('id')
  .searchable('title', 'description', 'priority', 'status')
  .indexes('dueDate', 'priority', 'status', 'createdAt', 'updatedAt')
  .validate(z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    dueDate: z.date().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    status: z.enum(['todo', 'in-progress', 'done', 'archived']).default('todo'),
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date()),
    tags: z.array(z.string()).optional()
  }))
  .build();