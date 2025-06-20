import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/remove-get-ui-text';

describe('remove-get-ui-text', () => {
  it('removes getUIText import and replaces function calls correctly', () => {
    testTransform(transformer, 'remove-get-ui-text');
  });

  it('removes entire import when only getUIText is imported', () => {
    testTransform(transformer, 'remove-get-ui-text-only-import');
  });
});
