import { describe, expect, it, vi } from 'vitest'

vi.mock('../../columnist', () => {
  class ColumnistDB {}
  class ColumnistDBError extends Error {}
  const DeviceTableSchema = { columns: {}, primaryKey: 'id' }
  return { ColumnistDB, ColumnistDBError, DeviceTableSchema }
})

import { SupabaseSyncAdapter } from '../adapters/supabase-adapter'

const dbStub = {
  getSchema: () => ({ docs: { columns: {}, primaryKey: 'id' } })
}

describe('SupabaseSyncAdapter retries', () => {
  it('calculates backoff based on strategy', () => {
    const adapter = new SupabaseSyncAdapter(dbStub as any, {
      supabaseUrl: 'https://example.com',
      supabaseKey: 'test',
      backoffStrategy: 'exponential'
    }) as any

    expect(adapter.calculateBackoff(1)).toBe(1000)
    expect(adapter.calculateBackoff(2)).toBe(2000)

    adapter.options.backoffStrategy = 'linear'
    expect(adapter.calculateBackoff(3)).toBe(3000)

    adapter.options.backoffStrategy = 'fixed'
    expect(adapter.calculateBackoff(3)).toBe(1000)
  })

  it('retries pushChanges with exponential backoff before succeeding', async () => {
    const adapter = new SupabaseSyncAdapter(dbStub as any, {
      supabaseUrl: 'https://example.com',
      supabaseKey: 'test',
      maxRetries: 3,
      backoffStrategy: 'exponential'
    }) as any

    const mockSupabase = createFlakySupabase(3)
    adapter.supabase = mockSupabase

    const delaySpy = vi.spyOn(adapter, 'delay').mockResolvedValue(undefined)

    await adapter.pushChanges({
      inserts: [{ _table: 'docs', id: 1, body: 'hello' }],
      updates: [],
      deletes: [],
      timestamp: new Date()
    })

    expect(mockSupabase.attempts).toBe(3)
    expect(delaySpy).toHaveBeenCalledTimes(2)
    expect(delaySpy).toHaveBeenNthCalledWith(1, 1000)
    expect(delaySpy).toHaveBeenNthCalledWith(2, 2000)
  })
})

function createFlakySupabase(successOnAttempt: number) {
  let attempts = 0

  return {
    get attempts() {
      return attempts
    },
    from() {
      return {
        upsert: () => {
          attempts++
          if (attempts < successOnAttempt) {
            const error: any = new Error('transient failure')
            error.code = '500'
            return { data: null, error }
          }
          return { data: [], error: null }
        },
        update: () => ({
          eq: () => ({ error: null })
        }),
        delete: () => ({
          in: () => ({ error: null })
        })
      }
    }
  }
}
