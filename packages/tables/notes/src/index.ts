export { notesSchema } from './schema';
export { useNotes, useNotesSearch, useLiveNotes } from './hooks';
export type { Note, NotesTable } from './types';

import { Columnist } from 'columnist-db-core';
import { notesSchema } from './schema';

// Pre-configured database instance for notes
export async function getNotesDb() {
  return await Columnist.init('notes-app', {
    databaseName: 'notes-app',
    schema: { notes: notesSchema }
  });
}