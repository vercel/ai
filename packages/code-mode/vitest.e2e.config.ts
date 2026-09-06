import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/e2e/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
