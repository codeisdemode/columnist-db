import { useCallback } from 'react';
import { useColumnist, useLiveQuery } from 'columnist-db-hooks';
import type { Task } from './types';

export function useTasks() {
  const { db } = useColumnist({ name: 'tasks-app' });

  const createTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!db) throw new Error('Database not initialized');
    return db.insert({
      ...task,
      createdAt: new Date(),
      updatedAt: new Date()
    }, 'tasks');
  }, [db]);

  const updateTask = useCallback(async (id: number, updates: Partial<Omit<Task, 'id'>>) => {
    if (!db) throw new Error('Database not initialized');
    return db.update(id, {
      ...updates,
      updatedAt: new Date()
    }, 'tasks');
  }, [db]);

  const deleteTask = useCallback(async (id: number) => {
    if (!db) throw new Error('Database not initialized');
    return db.delete(id, 'tasks');
  }, [db]);

  return {
    createTask,
    updateTask,
    deleteTask
  };
}

export function useLiveTasks(options?: { status?: string; priority?: string; limit?: number }) {
  return useLiveQuery<Task>({
    table: 'tasks',
    where: { 
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.priority ? { priority: options.priority } : {})
    },
    orderBy: { field: 'dueDate', direction: 'asc' },
    limit: options?.limit || 50,
    subscribe: true
  });
}

export function useTasksSearch(query: string, options?: { status?: string; priority?: string; limit?: number }) {
  const { db } = useColumnist({ name: 'tasks-app' });
  
  const searchTasks = useCallback(async () => {
    if (!db || !query.trim()) return [];
    
    const searchOptions: any = { 
      table: 'tasks',
      limit: options?.limit || 20 
    };
    
    if (options?.status) {
      searchOptions.status = options.status;
    }
    if (options?.priority) {
      searchOptions.priority = options.priority;
    }
    
    return db.search(query, searchOptions);
  }, [db, query, options]);

  return searchTasks;
}