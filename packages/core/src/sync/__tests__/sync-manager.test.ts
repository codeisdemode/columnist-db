import { describe, it, expect } from 'vitest'
import { SyncManager } from '../sync-manager'
import { DeviceManager } from '../device-utils'

const createStubDb = (syncEnabled: boolean, autoRegisterDevices: boolean = true) => {
  let schema: Record<string, unknown> = {}

  return {
    getOptions: () => ({
      sync: { enabled: syncEnabled, autoRegisterDevices }
    }),
    getSchema: () => schema,
    defineSchema: (nextSchema: Record<string, unknown>) => {
      schema = nextSchema
    }
  } as unknown as Parameters<typeof SyncManager.prototype.constructor>[0]
}

describe('SyncManager.initialize', () => {
  it('does not create a device manager when sync is disabled', async () => {
    const db = createStubDb(false)
    const manager = new SyncManager(db)

    await manager.initialize()

    expect((manager as any).deviceManager).toBeNull()
  })

  it('initializes the device manager and ensures device schema when sync is enabled', async () => {
    const db = createStubDb(true)
    const manager = new SyncManager(db)

    await manager.initialize()

    const deviceManager = (manager as any).deviceManager
    expect(deviceManager).toBeInstanceOf(DeviceManager)

    const schema = (db as any).getSchema()
    expect(schema.devices).toBeDefined()
  })
})
