import { defineConfig } from 'vitest/config';

export function createVitestConfig(environment) {
  return defineConfig({
    test: {
      environment,
      include: ['src/**/*.test.ts'],
      typecheck: {
        enabled: true,
      },
    },
  });
}
