import { describe, expect, it } from 'vitest';
import { convertDeepSeekUsage } from './convert-to-deepseek-usage';

describe('convertDeepSeekUsage', () => {
  it('clamps text tokens at 0 when reasoning exceeds completion', () => {
    const usage = {
      prompt_tokens: 951,
      completion_tokens: 6000,
      completion_tokens_details: { reasoning_tokens: 6001 },
    };

    expect(convertDeepSeekUsage(usage)).toEqual({
      inputTokens: {
        total: 951,
        noCache: 951,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: { total: 6000, text: 0, reasoning: 6001 },
      raw: usage,
    });
  });
});
