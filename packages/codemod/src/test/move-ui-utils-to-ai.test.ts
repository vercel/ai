import { describe, it } from 'vitest';
import transformer from '../codemods/move-ui-utils-to-ai';
import { testTransform } from './test-utils';

describe('move-ui-utils-to-ai', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'move-ui-utils-to-ai');
  });
});
