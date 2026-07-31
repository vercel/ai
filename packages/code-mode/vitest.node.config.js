import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'src/e2e/**'],
    include: ['src/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
