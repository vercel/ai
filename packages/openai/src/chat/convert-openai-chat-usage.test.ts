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

  it('treats prompt tokens as uncached when the cache breakdown exceeds them', () => {
    // Some providers report prompt_tokens exclusive of cached tokens. The
    // subtraction would underflow, so the reported value IS the uncached count.
    const usage = {
      prompt_tokens: 12,
      completion_tokens: 40,
      total_tokens: 4152,
      prompt_tokens_details: { cached_tokens: 4100 },
      completion_tokens_details: { reasoning_tokens: 0 },
    };

    expect(convertOpenAIChatUsage(usage)).toEqual({
      inputTokens: {
        total: 4112,
        noCache: 12,
        cacheRead: 4100,
        cacheWrite: undefined,
      },
      outputTokens: { total: 40, text: 40, reasoning: 0 },
      raw: usage,
    });
  });

  it('accounts for cache writes when inferring the reporting convention', () => {
    const usage = {
      prompt_tokens: 30,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 900, cache_write_tokens: 200 },
    };

    const result = convertOpenAIChatUsage(usage);

    expect(result.inputTokens.noCache).toBe(30);
    expect(result.inputTokens.total).toBe(1130);
  });
});
