import { describe, expect, it } from 'vitest';
import { convertOpenAIChatUsage } from './convert-openai-chat-usage';

describe('convertOpenAIChatUsage', () => {
  it('clamps text tokens at 0 when reasoning exceeds completion', () => {
    const usage = {
      prompt_tokens: 951,
      completion_tokens: 6000,
      total_tokens: 6952,
      prompt_tokens_details: { cached_tokens: 60 },
      completion_tokens_details: { reasoning_tokens: 6001 },
    };

    expect(convertOpenAIChatUsage(usage)).toEqual({
      inputTokens: {
        total: 951,
        noCache: 891,
        cacheRead: 60,
        cacheWrite: undefined,
      },
      outputTokens: { total: 6000, text: 0, reasoning: 6001 },
      raw: usage,
    });
  });
});
