/* v8 ignore start */
import { defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        100: true,
      },
    },
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/*.ui.test.ts', '**/*.ui.test.tsx', 'node_modules/**'],
    typecheck: {
      enabled: true,
    },
  },
});
