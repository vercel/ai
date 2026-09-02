import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['src/tool/mcp-stdio/index.ts'],
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    dts: true,
    sourcemap: true,
    outDir: 'dist/mcp-stdio',
  },
]);
