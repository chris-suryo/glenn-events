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
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      // Coverage is scoped to the unit-testable logic layer. The UI/route layer
      // (app/, components/) is deferred to a future component/E2E harness and is
      // tracked separately — including it here would report a misleading ~0%.
      include: ['lib/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'lib/types/**', // type-only declarations, no runtime
        'lib/supabase/**', // SSR/browser client factories — I/O wiring
        // Live-I/O AI modules: covered by the real-LLM `test:extract` harness, not units.
        'lib/ai/llm-extract.ts',
        'lib/ai/event-summary.ts',
        'lib/ai/apply-proposed-update.ts',
        'lib/upload-file.ts', // Storage I/O
        'lib/events/**', // server actions / data fetchers (Supabase client)
      ],
    },
  },
})
