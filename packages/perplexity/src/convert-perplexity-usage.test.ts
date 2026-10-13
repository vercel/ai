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
      inputTokens: {
        total: 33,
        noCache: 33,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: {
        total: 205342,
        text: 11395,
        reasoning: 193947,
      },
      raw: usage,
    });
  });
});
