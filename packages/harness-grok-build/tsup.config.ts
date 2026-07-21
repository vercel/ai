import { defineConfig } from 'tsup';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
  {
    entry: { 'bridge/index': 'src/bridge/index.ts' },
    format: ['esm'],
    target: 'es2022',
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
    platform: 'node',
    noExternal: ['@ai-sdk/harness'],
    external: ['@xai-official/grok', 'ws', 'zod'],
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
]);
