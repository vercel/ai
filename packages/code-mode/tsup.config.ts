import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'runtime/worker-source': 'src/runtime/worker-source.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'node',
    splitting: true,
  },
  {
    entry: {
      'runtime/worker': 'src/runtime/worker.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    splitting: false,
    external: ['quickjs-emscripten'],
  },
]);
