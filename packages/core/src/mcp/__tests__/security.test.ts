import { describe, it, expect, vi } from 'vitest'
import { SecurityManager, type SecurityConfig } from '../security'

const baseConfig: SecurityConfig = {
  maxConnectionsPerClient: 5,
  maxQueryComplexity: 100,
  allowedTables: [],
  allowedOperations: ['query'],
  rateLimitWindowMs: 1000,
  maxRequestsPerWindow: 10,
}

describe('SecurityManager logging', () => {
  it('buffers recent events and discards older ones', async () => {
    const manager = new SecurityManager(baseConfig, { maxBufferedEvents: 2 })

    await manager.logSecurityEvent('event-1', { value: 1 })
    await manager.logSecurityEvent('event-2', { value: 2 })
    await manager.logSecurityEvent('event-3', { value: 3 })

    const events = manager.getRecentEvents()
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('event-2')
    expect(events[1].event).toBe('event-3')

    manager.clearSecurityEvents()
    expect(manager.getRecentEvents()).toHaveLength(0)
  })

  it('forwards events to an injected logger', async () => {
    const logger = { log: vi.fn() }
    const manager = new SecurityManager(baseConfig, { logger })

    const details = { resource: 'secrets' }
    await manager.logSecurityEvent('audit', details)

    expect(logger.log).toHaveBeenCalledTimes(1)
    const payload = logger.log.mock.calls[0][0]
    expect(payload.event).toBe('audit')
    expect(payload.details).toEqual(details)
    expect(manager.getRecentEvents(1)[0].event).toBe('audit')
  })
})
