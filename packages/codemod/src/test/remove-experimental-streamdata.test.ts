import { describe, it } from 'vitest';
import transformer from '../codemods/remove-experimental-streamdata';
import { testTransform } from './test-utils';

describe('remove-experimental-streamdata', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-experimental-streamdata');
  });
});
