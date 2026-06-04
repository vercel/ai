import { defineConfig } from 'vitest/config';

/*
 * Unit config — the fixture-engine tests. Fast, no sandbox, no credentials; runs
 * in the default `pnpm test`. The sandbox-booting replay suite (`*.e2e.test.ts`)
 * is deliberately excluded here and runs via `vitest.integration.config.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.test.ts'],
  },
});
