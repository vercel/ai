import { describe, it } from 'vitest';
import transformer from '../codemods/remove-google-topk';
import { testTransform } from './test-utils';

describe('remove-google-topk', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-google-topk');
  });
});
