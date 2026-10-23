import { readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);
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

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    define: {
      __PACKAGE_VERSION__: packageVersion,
      __GITHUB_COPILOT_BRIDGE_PACKAGE_JSON__: bridgePackageJson,
      __GITHUB_COPILOT_BRIDGE_PNPM_LOCK_YAML__: bridgePnpmLockYaml,
      __GITHUB_COPILOT_BRIDGE_PNPM_WORKSPACE_YAML__: bridgePnpmWorkspaceYaml,
    },
  }),
);
