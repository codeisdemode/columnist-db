import { randomUUID } from 'node:crypto'

export function createDbName(prefix: string): string {
  const unique = randomUUID().split('-')[0]
  return `${prefix}-${unique}`
}

type DBLike = { db?: IDBDatabase }

export async function destroyDatabase(name: string, db?: unknown): Promise<void> {
  const connection = (db as DBLike | undefined)?.db
  if (connection && typeof connection.close === 'function') {
    try {
      connection.close()
    } catch {
      // Ignore close errors in test cleanup
    }
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Failed to delete IndexedDB instance'))
    request.onblocked = () => resolve()
  })
}
