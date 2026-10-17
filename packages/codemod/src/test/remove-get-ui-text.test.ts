import { describe, it } from 'vitest';
import transformer from '../codemods/v5/remove-get-ui-text';
import { testTransform } from './test-utils';

describe('remove-get-ui-text', () => {
  it('expands direct calls', () => {
    testTransform(transformer, 'remove-get-ui-text');
  });

  it('replaces function references with an inline callback', () => {
    testTransform(transformer, 'remove-get-ui-text-reference');
  });
});
