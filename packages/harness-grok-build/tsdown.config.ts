import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

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

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  clean: false,
  target: 'es2022',
  dts: true,
  sourcemap: true,
  define: {
    __PACKAGE_VERSION__: packageVersion,
    __GROK_BUILD_IMPLEMENTATION_PACKAGE_JSON__: implementationPackageJson,
    __GROK_BUILD_IMPLEMENTATION_PNPM_LOCK_YAML__: implementationPnpmLockYaml,
    __GROK_BUILD_IMPLEMENTATION_PNPM_WORKSPACE_YAML__:
      implementationPnpmWorkspaceYaml,
  },
});
