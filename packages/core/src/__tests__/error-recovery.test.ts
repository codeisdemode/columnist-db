import { afterEach, describe, expect, it, vi } from 'vitest'
import { Columnist, ColumnistDB } from '../columnist'
import { createDbName, destroyDatabase } from './db-test-utils'

const errorSchema = {
  columns: {
    id: 'number',
    body: 'string'
  },
  primaryKey: 'id'
} as const

describe('Columnist error recovery', () => {
  const databases: { name: string; instance?: ColumnistDB }[] = []

  afterEach(async () => {
    for (const entry of databases.splice(0)) {
      await destroyDatabase(entry.name, entry.instance)
    }
  })

  it('retries transient errors before succeeding', async () => {
    const name = createDbName('recovery-success')
    const db = await Columnist.init(name, { version: 1, schema: { docs: errorSchema } })
    databases.push({ name, instance: db })

    const operation = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('Network blip'))
      .mockResolvedValue('ok')

    const result = await (db as any).withErrorRecovery(operation, 'vector_search')

    expect(result).toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('opens the circuit breaker after repeated failures', async () => {
    const name = createDbName('recovery-circuit')
    const db = await Columnist.init(name, { version: 1, schema: { docs: errorSchema } })
    databases.push({ name, instance: db })

    const internal = db as any
    internal.errorRecoveryConfig.maxRetryAttempts = 0
    internal.errorRecoveryManager.circuitBreakerConfig.failureThreshold = 2

    const failingOp = vi.fn<[], Promise<void>>().mockRejectedValue(new Error('Network outage'))

    await expect(internal.withErrorRecovery(failingOp, 'sync_push')).rejects.toThrow('Network outage')
    await expect(internal.withErrorRecovery(failingOp, 'sync_push')).rejects.toThrow('Network outage')
    await expect(internal.withErrorRecovery(failingOp, 'sync_push')).rejects.toThrow(/Circuit breaker is OPEN/)
  })
})

