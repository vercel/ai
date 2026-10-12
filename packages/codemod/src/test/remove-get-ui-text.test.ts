import { describe, it } from 'vitest';
import transformer from '../codemods/v5/remove-get-ui-text';
import { testTransform } from './test-utils';

describe('remove-get-ui-text', () => {
  it('preserves a leading multiline comment when removing the import', () => {
    testTransform(transformer, 'remove-get-ui-text-leading-multiline-comment');
  });
});
