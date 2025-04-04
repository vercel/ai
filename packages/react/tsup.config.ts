import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    banner: {},
    format: ['cjs', 'esm'],
    external: ['vue'],
    dts: true,
    sourcemap: true,
  },

  // RSC APIs - shared client
  {
    // Entry is `.mts` as the entrypoints that import it will be ESM so it needs exact imports that includes the `.mjs` extension.
    entry: ['src/rsc/rsc-shared.mts'],
    outDir: 'dist/rsc',
    format: ['esm'],
    external: ['react', 'zod'],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - server, client
  {
    entry: ['src/rsc/rsc-server.ts', 'src/rsc/rsc-client.ts'],
    outDir: 'dist/rsc',
    format: ['esm'],
    external: ['react', 'zod', /\/rsc-shared/],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - types
  {
    entry: ['src/rsc/index.ts'],
    outDir: 'dist/rsc',
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
