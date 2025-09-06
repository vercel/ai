import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { assert: { type: 'json' } })).default
          .version,
      ),
    },
  },
]);
