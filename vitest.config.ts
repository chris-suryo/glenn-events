import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Pure-logic unit tests only (no network/LLM/DB) — node environment, no jsdom.
// Resolves the `@/*` path alias the app uses (tsconfig paths: "@/*" -> "./*").
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
})
