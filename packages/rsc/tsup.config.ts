import { defineConfig } from 'tsup';

export default defineConfig([
  // RSC APIs - shared client
  {
    entry: ['src/rsc-shared.ts'],
    outDir: 'dist',
    format: ['esm'],
    external: ['react', 'zod'],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - server, client
  {
    entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
    outDir: 'dist',
    format: ['esm'],
    external: ['react', 'zod', /\/rsc-shared/],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - types
  {
    entry: ['src/types/index.ts'],
    outDir: 'dist',
    dts: true,
    outExtension() {
      return {
        // It must be `.d.ts` instead of `.d.mts` to support node resolution.
        // See https://github.com/vercel/ai/issues/1028.
        dts: '.d.ts',
        js: '.mjs',
      };
    },
  },
]);
