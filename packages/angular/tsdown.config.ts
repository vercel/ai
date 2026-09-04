import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm'],
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // deps: { neverBundle: [/node_modules/] } // list dependencies here if needed
});
