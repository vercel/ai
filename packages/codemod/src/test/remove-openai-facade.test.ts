import { describe, it } from 'vitest';
import transformer from '../codemods/remove-openai-facade';
import { testTransform } from './test-utils';

describe('remove-openai-facade', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-openai-facade');
  });
});
