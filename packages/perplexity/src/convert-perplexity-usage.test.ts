import { describe, expect, it } from 'vitest';
import { convertPerplexityUsage } from './convert-perplexity-usage';

describe('convertPerplexityUsage', () => {
  it('clamps text tokens at 0 when reasoning exceeds completion', () => {
    const usage = {
      prompt_tokens: 951,
      completion_tokens: 6000,
      reasoning_tokens: 6001,
    };

    expect(convertPerplexityUsage(usage)).toEqual({
      inputTokens: {
        total: 951,
        noCache: 951,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 6000, text: 0, reasoning: 6001 },
      raw: usage,
    });
  });
});
