import { defineConfig } from 'tsdown';

export default defineConfig([
  // RSC APIs - shared client
  {
    // Kept as a separate chunk so server and client bundles share one module instance at runtime.
    entry: ['src/rsc-shared.ts'],
    outDir: 'dist',
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    deps: {
      neverBundle: ['react', 'react/*', 'zod', 'zod/*'],
    },
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - server, client
  {
    entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
    outDir: 'dist',
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    deps: {
      neverBundle: ['react', 'react/*', 'zod', 'zod/*', /\/rsc-shared/],
    },
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - types
  {
    entry: ['src/types/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    dts: true,
  },
]);
