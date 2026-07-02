import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // Next's 'server-only' guard throws outside a React Server context;
      // unit tests import server libs directly, so stub it out.
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
