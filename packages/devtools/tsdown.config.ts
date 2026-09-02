import { defineConfig } from 'tsdown';

export default defineConfig([
  // Middleware entry (main package export)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    target: 'es2022',
    dts: true,
    outDir: 'dist',
    clean: false,
  },
  // Viewer server
  {
    entry: ['src/viewer/server.ts'],
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    target: 'es2022',
    outDir: 'dist/viewer',
    clean: false,
  },
]);
