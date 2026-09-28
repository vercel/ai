import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // external: [/node_modules/] // you can list external deps here if needed
});
