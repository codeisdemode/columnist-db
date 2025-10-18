import type { InferTableType } from 'columnist-db-core';
import type { notesSchema } from './schema';

export type Note = InferTableType<typeof notesSchema>;
export type NotesTable = typeof notesSchema;