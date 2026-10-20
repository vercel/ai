import { mergeConfig } from 'vitest/config';
import { createVitestConfig } from './vitest.config.js';

export default mergeConfig(createVitestConfig('edge-runtime'), {
  test: {
    exclude: ['**/*.node.test.ts'],
  },
});
