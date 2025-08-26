import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    // Keep library target conservative for wide compatibility
    target: 'es2018',
    platform: 'node',
  },
  {
    entry: ['src/test/index.ts'],
    outDir: 'dist/test',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    // Chai uses BigInt literals; ensure the target supports it and avoid bundling chai
    target: 'es2020',
    platform: 'node',
    external: ['chai'],
  },
]);
