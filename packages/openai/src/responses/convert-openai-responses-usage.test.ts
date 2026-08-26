import { describe, expect, it } from 'vitest';
import { convertOpenAIResponsesUsage } from './convert-openai-responses-usage';

describe('convertOpenAIResponsesUsage', () => {
  it('subtracts the cache breakdown when input tokens include it', () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 900 },
    };

    expect(convertOpenAIResponsesUsage(usage)).toEqual({
      inputTokens: {
        total: 1000,
        noCache: 100,
        cacheRead: 900,
        cacheWrite: undefined,
      },
      outputTokens: { total: 40, text: 40, reasoning: 0 },
      raw: usage,
    });
  });

  it('treats input tokens as uncached when the cache breakdown exceeds them', () => {
    // Some providers report input_tokens exclusive of cached tokens. The
    // subtraction would underflow, so the reported value IS the uncached count.
    const usage = {
      input_tokens: 12,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 4100 },
    };

    expect(convertOpenAIResponsesUsage(usage)).toEqual({
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
    const result = convertOpenAIResponsesUsage({
      input_tokens: 30,
      output_tokens: 10,
      input_tokens_details: { cached_tokens: 900, cache_write_tokens: 200 },
    });

    expect(result.inputTokens.noCache).toBe(30);
    expect(result.inputTokens.total).toBe(1130);
    expect(result.inputTokens.cacheRead).toBe(900);
    expect(result.inputTokens.cacheWrite).toBe(200);
  });

  it('returns null usage for missing usage', () => {
    expect(
      convertOpenAIResponsesUsage(null).inputTokens.noCache,
    ).toBeUndefined();
  });
});
