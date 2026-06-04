import { defineConfig } from 'vitest/config';

/*
 * Integration config — the real-CLI replay suite. Each test boots a real Vercel
 * sandbox (~60s) and requires Vercel credentials even in pure replay (only the
 * LLM HTTP is canned). Kept out of the default `pnpm test`; invoked via the
 * `test:integration` script (the first implementor of the root turbo
 * `test:integration` task).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./vitest.integration.setup.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    retry: 1,
    pool: 'forks',
    maxConcurrency: 2,
  },
});
