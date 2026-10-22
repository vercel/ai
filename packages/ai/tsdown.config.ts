import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    // One graph keeps public, internal, and test entrypoints on the same type
    // declarations, including interfaces augmented by downstream packages.
    entry: {
      index: 'src/index.ts',
      'internal/index': 'internal/index.ts',
      'test/index': 'test/index.ts',
    },
    deps: {
      neverBundle: [
        'react',
        'svelte',
        'vue',
        'chai',
        'chai/*',
        'vitest',
        'vitest/*',
        '@vitest/*',
        'vitest/dist/*',
        'vitest/dist/chunks/*',
        'vitest/dist/node/*',
        'vitest/dist/node/chunks/*',
      ],
    },
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  }),
);
