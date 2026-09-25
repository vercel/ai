import { defineConfig } from 'tsup';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
  {
    entry: { 'bridge/index': 'src/bridge/index.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
    platform: 'node',
    // The shared bridge runtime (`@ai-sdk/harness/bridge`) must be INLINED —
    // the sandbox only installs the bridge's own deps, so a bare import would
    // not resolve there. tsup externalizes package.json deps by default, hence
    // the explicit override.
    noExternal: ['@ai-sdk/harness'],
    external: ['@openai/codex', 'ws'],
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
]);
