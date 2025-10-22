import '@testing-library/jest-dom'
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
import { webcrypto } from 'node:crypto'
import { vi } from 'vitest'

if (!globalThis.indexedDB) {
  globalThis.indexedDB = indexedDB as unknown as IDBFactory
}

globalThis.IDBKeyRange = IDBKeyRange as unknown as typeof IDBKeyRange

if (!globalThis.crypto || !(globalThis.crypto as Crypto).subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as unknown as typeof ResizeObserver
