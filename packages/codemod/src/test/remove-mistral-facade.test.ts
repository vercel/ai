import { describe, it } from 'vitest';
import transformer from '../codemods/remove-mistral-facade';
import { testTransform } from './test-utils';

describe('remove-mistral-facade', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-mistral-facade');
  });
});
