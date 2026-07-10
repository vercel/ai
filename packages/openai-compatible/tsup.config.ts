import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  },
  {
    entry: ['src/internal/index.ts'],
    outDir: 'dist/internal',
    format: ['esm'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  },
]);
