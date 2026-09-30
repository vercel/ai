import { describe, expect, it } from 'vitest';
import { convertPerplexityUsage } from './convert-perplexity-usage';

describe('convertPerplexityUsage', () => {
  it('treats reasoning tokens as separate from completion tokens', () => {
    const usage = {
      input_tokens: 33,
      output_tokens: 205342,
      output_tokens_details: {
        reasoning_tokens: 193947,
      },
    };

    expect(convertPerplexityUsage(usage)).toEqual({
      inputTokens: 33,
      outputTokens: 205342,
      totalTokens: 205375,
      reasoningTokens: 193947,
      cachedInputTokens: undefined,
    });
  });
});
