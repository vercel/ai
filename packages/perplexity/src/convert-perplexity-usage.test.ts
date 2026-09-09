import { describe, expect, it } from 'vitest';
import { convertPerplexityUsage } from './convert-perplexity-usage';

describe('convertPerplexityUsage', () => {
  it('treats reasoning tokens as separate from completion tokens', () => {
    const usage = {
      prompt_tokens: 33,
      completion_tokens: 11395,
      reasoning_tokens: 193947,
    };

    expect(convertPerplexityUsage(usage)).toEqual({
      inputTokens: {
        total: 33,
        noCache: 33,
        cacheRead: undefined,
        cacheWrite: undefined,
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
