import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    banner: {
      js: [
        '// Copyright 2024 Vercel Inc. and Bailing AI contributors',
        '// SPDX-License-Identifier: Apache-2.0',
      ].join('\n'),
    },
  },
]);

