import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const resolveFromRoot = (relativePath: string) => path.resolve(rootDir, relativePath)

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/setup.ts',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/**'
      ]
    },
  },
  resolve: {
    alias: {
      '@': resolveFromRoot('src'),
      '@lib': resolveFromRoot('lib'),
      'columnist-db-core': resolveFromRoot('packages/core/src'),
      'columnist-db-plugin-openai-embedding': resolveFromRoot('packages/plugins/openai-embedding/src'),
      'columnist-db-hooks': resolveFromRoot('packages/hooks/src')
    }
  }
})
