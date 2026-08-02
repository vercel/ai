import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/utils/serde.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'es2022',
    platform: 'node',
    bundle: false,
  },
  {
    entry: { 'utils/serde': 'src/utils/serde.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'es2022',
    platform: 'node',
    bundle: true,
    noExternal: ['devalue'],
  },
  {
    entry: {
      index: 'src/index.ts',
      'runtime/worker-source': 'src/runtime/worker-source.ts',
    },
    format: ['esm'],
    dts: {
      only: true,
    },
    target: 'es2022',
    platform: 'node',
  },
]);
