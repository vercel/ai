import { readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);
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
const implementationPnpmWorkspaceYaml = JSON.stringify(
  readFileSync(
    new URL('./src/bridge/pnpm-workspace.yaml', import.meta.url),
  ).toString(),
);

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    entry: { index: 'src/index.ts' },
    define: {
      __PACKAGE_VERSION__: packageVersion,
      __GITHUB_COPILOT_IMPLEMENTATION_PACKAGE_JSON__: implementationPackageJson,
      __GITHUB_COPILOT_IMPLEMENTATION_PNPM_LOCK_YAML__:
        implementationPnpmLockYaml,
      __GITHUB_COPILOT_IMPLEMENTATION_PNPM_WORKSPACE_YAML__:
        implementationPnpmWorkspaceYaml,
    },
    clean: false,
  }),
);
