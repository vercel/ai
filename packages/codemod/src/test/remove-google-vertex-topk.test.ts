import { describe, it } from 'vitest';
import transformer from '../codemods/remove-google-vertex-topk';
import { testTransform } from './test-utils';

describe('remove-google-vertex-topk', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-google-vertex-topk');
  });
});
