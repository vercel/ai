import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/remove-openai-compatibility';

describe('remove-openai-compatibility', () => {
  it('removes compatibility property from createOpenAI calls', () => {
    testTransform(transformer, 'remove-openai-compatibility');
  });

  it('only affects createOpenAI from @ai-sdk/openai, not @ai-sdk/openai-compatible', () => {
    testTransform(transformer, 'remove-openai-compatibility-mixed-imports');
  });
});
