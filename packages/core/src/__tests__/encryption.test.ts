import { afterEach, describe, expect, it } from 'vitest'
import { Columnist, ColumnistDB, defineTable } from '../columnist'
import { createDbName, destroyDatabase } from './db-test-utils'

describe('Columnist encryption key rotation', () => {
  const databases: { name: string; instance?: ColumnistDB }[] = []

  afterEach(async () => {
    for (const entry of databases.splice(0)) {
      await destroyDatabase(entry.name, entry.instance)
    }
  })

  it('re-encrypts sensitive fields when rotating the key', async () => {
    const dbName = createDbName('encryption-rotation')
    const secretsTable = defineTable()
      .column('id', 'string')
      .column('name', 'string')
      .column('apiKey', 'string')
      .column('createdAt', 'date')
      .column('updatedAt', 'date')
      .primaryKey('id')
      .searchable('name')
      .build()

    const db = await Columnist.init(dbName, {
      version: 1,
      schema: {
        secrets: secretsTable,
      },
      encryptionKey: 'initial-secret'
    })
    databases.push({ name: dbName, instance: db })

    const timestamp = new Date()
    await db.insert({
      id: 'secret-1',
      name: 'Primary Token',
      apiKey: 'top-secret-token',
      createdAt: timestamp,
      updatedAt: timestamp,
    }, 'secrets')

    const readableBefore = await db.getAll<{ id: string; apiKey: string }>('secrets', 10)
    expect(readableBefore[0].apiKey).toBe('top-secret-token')

    const ciphertextBefore = await readRawCipher(db as any, 'secrets', 'secret-1')
    expect(typeof ciphertextBefore).toBe('string')
    expect(ciphertextBefore).not.toBe('top-secret-token')

    await db.rotateEncryptionKey('next-secret')

    const readableAfter = await db.getAll<{ id: string; apiKey: string }>('secrets', 10)
    expect(readableAfter[0].apiKey).toBe('top-secret-token')

    const ciphertextAfter = await readRawCipher(db as any, 'secrets', 'secret-1')
    expect(typeof ciphertextAfter).toBe('string')
    expect(ciphertextAfter).not.toBe('top-secret-token')
    expect(ciphertextAfter).not.toBe(ciphertextBefore)
  }, 20000)
})

async function readRawCipher(db: any, table: string, key: string): Promise<string> {
  const database: IDBDatabase = db.db
  const tx = database.transaction([table], 'readonly')
  const store = tx.objectStore(table)

  const value = await new Promise<any>((resolve, reject) => {
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })

  return value.apiKey
}
