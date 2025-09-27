import type { InferTableType } from 'columnist-db-core';
import type { tasksSchema } from './schema';

export type Task = InferTableType<typeof tasksSchema>;
export type TasksTable = typeof tasksSchema;