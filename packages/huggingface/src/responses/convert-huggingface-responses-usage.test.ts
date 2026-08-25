import { describe, expect, it } from 'vitest';
import { convertHuggingFaceResponsesUsage } from './convert-huggingface-responses-usage';

describe('convertHuggingFaceResponsesUsage', () => {
  it('subtracts cached tokens when input tokens include them', () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 40,
      total_tokens: 1040,
      input_tokens_details: { cached_tokens: 900 },
    };

    expect(convertHuggingFaceResponsesUsage(usage)).toEqual({
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
    const usage = {
      input_tokens: 12,
      output_tokens: 40,
      total_tokens: 52,
      input_tokens_details: { cached_tokens: 4100 },
    };

    expect(convertHuggingFaceResponsesUsage(usage)).toEqual({
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

  it('returns null usage for missing usage', () => {
    expect(
      convertHuggingFaceResponsesUsage(null).inputTokens.noCache,
    ).toBeUndefined();
  });
});
