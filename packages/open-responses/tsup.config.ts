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
    tsconfig: 'tsconfig.build.json',
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  },
]);
