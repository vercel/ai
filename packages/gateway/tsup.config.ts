import { defineConfig, type Options } from 'tsup';

const commonConfig: Options = {
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  define: {
    __PACKAGE_VERSION__: JSON.stringify(
      (await import('./package.json', { with: { type: 'json' } })).default
        .version,
    ),
  },
};

export default defineConfig([
  {
    ...commonConfig,
    outDir: 'dist/node',
    esbuildOptions(options) {
      // for some reason, using just "node" does not work
      // When using `"node"` as key in the `imports` field of package.json,
      // it gets used by `default` below, too. ¯\_(ツ)_/¯
      options.conditions = ['just-node-workaround'];
    },
  },
  {
    ...commonConfig,
    outDir: 'dist/default',
    esbuildOptions(options) {
      options.conditions = ['default'];
    },
  },
]);
