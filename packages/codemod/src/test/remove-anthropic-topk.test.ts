import { describe, it } from 'vitest';
import transformer from '../codemods/remove-anthropic-topk';
import { testTransform } from './test-utils';

describe('remove-anthropic-topk', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-anthropic-topk');
  });
});
