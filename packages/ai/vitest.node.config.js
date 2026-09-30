import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';
import { createVitestConfig } from './vitest.config.js';

export default mergeConfig(createVitestConfig('node'), {
  test: {
    setupFiles: [
      fileURLToPath(
        new URL('../../tools/setup-download-fetch.node.js', import.meta.url),
      ),
    ],
  },
});
