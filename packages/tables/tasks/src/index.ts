export { tasksSchema } from './schema';
export { useTasks, useTasksSearch, useLiveTasks } from './hooks';
export type { Task, TasksTable } from './types';

import { Columnist } from 'columnist-db-core';
import { tasksSchema } from './schema';

// Pre-configured database instance for tasks
export const tasksDb = Columnist.init('tasks-app', {
  databaseName: 'tasks-app',
  schema: { tasks: tasksSchema }
});