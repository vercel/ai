import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/rename-max-tokens-to-max-output-tokens';

describe('rename-max-tokens-to-max-output-tokens', () => {
  it('renames maxTokens to maxOutputTokens in all contexts', () => {
    testTransform(transformer, 'rename-max-tokens-to-max-output-tokens');
  });
});
