import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: { 'agent/index': 'agent/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: { 'channel/index': 'channel/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: { 'observability/index': 'observability/index.ts' },
    format: ['esm'],
    dts: true,
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
    dts: true,
    sourcemap: true,
    external: ['ws'],
  },
]);
