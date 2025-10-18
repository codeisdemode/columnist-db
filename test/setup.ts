import '@testing-library/jest-dom'

// Mock IndexedDB for testing
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'

// Mock global IndexedDB for browser environment
global.indexedDB = indexedDB as any
global.IDBKeyRange = IDBKeyRange as any

// Mock window.matchMedia for React components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver for React components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))