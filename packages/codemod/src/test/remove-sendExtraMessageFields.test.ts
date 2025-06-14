import { describe, it } from 'vitest';
import transformer from '../codemods/remove-sendExtraMessageFields';
import { testTransform } from './test-utils';

describe('remove-sendExtraMessageFields', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-sendExtraMessageFields');
  });
});
