import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const bridgePackageJson = JSON.stringify(
  readFileSync(
    new URL('./src/bridge/package.json', import.meta.url),
  ).toString(),
);
const bridgePnpmLockYaml = JSON.stringify(
  readFileSync(
    new URL('./src/bridge/pnpm-lock.yaml', import.meta.url),
  ).toString(),
);
const bridgePnpmWorkspaceYaml = JSON.stringify(
  readFileSync(
    new URL('./src/bridge/pnpm-workspace.yaml', import.meta.url),
  ).toString(),
);

export default defineConfig({
  define: {
    __GROK_BUILD_BRIDGE_PACKAGE_JSON__: bridgePackageJson,
    __GROK_BUILD_BRIDGE_PNPM_LOCK_YAML__: bridgePnpmLockYaml,
    __GROK_BUILD_BRIDGE_PNPM_WORKSPACE_YAML__: bridgePnpmWorkspaceYaml,
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
