import { describe, expect, it } from 'vitest';
import { convertGoogleUsage } from './convert-google-usage';

describe('convertGoogleUsage', () => {
  it('subtracts cached content tokens when prompt tokens include them', () => {
    const usage = {
      promptTokenCount: 1000,
      candidatesTokenCount: 40,
      cachedContentTokenCount: 900,
      thoughtsTokenCount: 5,
    };

    expect(convertGoogleUsage(usage)).toEqual({
      inputTokens: {
        total: 1000,
        noCache: 100,
        cacheRead: 900,
        cacheWrite: undefined,
      },
      outputTokens: { total: 45, text: 40, reasoning: 5 },
      raw: usage,
    });
  });

  it('treats prompt tokens as uncached when cached content exceeds them', () => {
    const usage = {
      promptTokenCount: 12,
      candidatesTokenCount: 40,
      cachedContentTokenCount: 4100,
    };

    expect(convertGoogleUsage(usage)).toEqual({
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
    expect(convertGoogleUsage(null).inputTokens.noCache).toBeUndefined();
  });
});
