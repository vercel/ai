import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  clean: false,
  target: 'es2022',
  dts: true,
  sourcemap: true,
});
