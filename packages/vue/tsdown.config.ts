import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    banner: {},
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    deps: {
      neverBundle: ['vue', 'vue/*'],
    },
    dts: true,
    sourcemap: true,
  },
]);
