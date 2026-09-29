import { describe, expect, it } from 'vitest';
import { convertDeepSeekUsage } from './convert-to-deepseek-usage';

describe('convertDeepSeekUsage', () => {
  it('uses OpenAI-compatible cached prompt tokens as a fallback', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 80 },
    };

    expect(convertDeepSeekUsage(usage, 'openai-compatible')).toEqual({
      inputTokens: {
        total: 100,
        noCache: 20,
        cacheRead: 80,
        cacheWrite: undefined,
      },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
      raw: usage,
    });
  });

  it('prefers native DeepSeek cached prompt tokens', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_cache_hit_tokens: 60,
      prompt_tokens_details: { cached_tokens: 80 },
    };

    expect(
      convertDeepSeekUsage(usage, 'openai-compatible').inputTokens,
    ).toEqual({
      total: 100,
      noCache: 40,
      cacheRead: 60,
      cacheWrite: undefined,
    });
  });

  it('ignores OpenAI-compatible cached prompt tokens by default', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 80 },
    };

    expect(convertDeepSeekUsage(usage).inputTokens).toEqual({
      total: 100,
      noCache: 100,
      cacheRead: 0,
      cacheWrite: undefined,
    });
  });

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
