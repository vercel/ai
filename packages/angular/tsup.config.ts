import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: {
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
  },
  format: ['esm'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // external: [/node_modules/] // you can list external deps here if needed
});
