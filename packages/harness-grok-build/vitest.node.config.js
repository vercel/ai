import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const implementationPackageJson = JSON.stringify(
  readFileSync(
    new URL('./src/bridge/package.json', import.meta.url),
  ).toString(),
);
const implementationPnpmLockYaml = JSON.stringify(
  readFileSync(
    new URL('./src/bridge/pnpm-lock.yaml', import.meta.url),
  ).toString(),
);

export default defineConfig({
  define: {
    __GROK_BUILD_IMPLEMENTATION_PACKAGE_JSON__: implementationPackageJson,
    __GROK_BUILD_IMPLEMENTATION_PNPM_LOCK_YAML__: implementationPnpmLockYaml,
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
