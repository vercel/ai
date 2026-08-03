import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: configDefaults.exclude,
    include: ['src/**/*.test.ts'],
    env: {
      RUN_CONTINUATION_SECRET: 'run-test-continuation-secret-32-bytes',
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
