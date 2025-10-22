import { describe, it, expect, vi } from 'vitest'
import { RAGDatabase } from '../rag-database'

describe('RAGDatabase sync initialization', () => {
  it('registers and starts a sync adapter when enabled', async () => {
    const ragDb = new RAGDatabase({
      syncEnabled: true,
      syncAdapter: 'rest',
      syncConfig: { baseURL: 'https://api.example.com' },
    })

    const registerSyncAdapter = vi.fn()
    const startSync = vi.fn()

    ;(ragDb as any).db = {
      getOptions: () => ({ sync: { enabled: true } }),
      registerSyncAdapter,
      startSync,
    }

    await (ragDb as any).initializeSync()

    expect(registerSyncAdapter).toHaveBeenCalledTimes(1)
    const [name, type, options] = registerSyncAdapter.mock.calls[0]
    expect(name).toContain('rest-sync')
    expect(type).toBe('rest')
    expect(options).toMatchObject({ baseURL: 'https://api.example.com', tables: ['documents', 'chunks'] })
    expect(startSync).toHaveBeenCalledWith(name)

    await (ragDb as any).initializeSync()
    expect(registerSyncAdapter).toHaveBeenCalledTimes(1)
  })

  it('skips sync setup when disabled', async () => {
    const ragDb = new RAGDatabase({ syncEnabled: false })
    ;(ragDb as any).db = {
      getOptions: () => ({ sync: { enabled: false } }),
      registerSyncAdapter: vi.fn(),
      startSync: vi.fn(),
    }

    await (ragDb as any).initializeSync()

    expect((ragDb as any).db.registerSyncAdapter).not.toHaveBeenCalled()
  })
})
