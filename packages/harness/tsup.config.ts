import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
  },
  {
    entry: { 'agent/index': 'agent/index.ts' },
    format: ['esm'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
  },
  {
    entry: { 'utils/index': 'utils/index.ts' },
    format: ['esm'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
  },
  {
    // The bridge core runs inside the sandbox and is re-bundled into each
    // adapter's `bridge.mjs`. `ws` is resolved from the sandbox-installed
    // node_modules, never bundled here.
    entry: { 'bridge/index': 'bridge/index.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'node',
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
    external: ['ws'],
  },
]);
