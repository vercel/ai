import { describe, expect, it } from 'vitest';
import { convertGoogleUsage } from './convert-google-usage';

describe('convertGoogleUsage', () => {
  it('includes tool-use prompt tokens in input usage', () => {
    expect(
      convertGoogleUsage({
        promptTokenCount: 55,
        toolUsePromptTokenCount: 89,
        candidatesTokenCount: 51,
        thoughtsTokenCount: 56,
        totalTokenCount: 251,
      }),
    ).toEqual({
      inputTokens: {
        total: 144,
        noCache: 144,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 107,
        text: 51,
        reasoning: 56,
      },
      raw: {
        promptTokenCount: 55,
        toolUsePromptTokenCount: 89,
        candidatesTokenCount: 51,
        thoughtsTokenCount: 56,
        totalTokenCount: 251,
      },
    });
  });

  it('includes tool-use prompt tokens when calculating uncached input', () => {
    expect(
      convertGoogleUsage({
        promptTokenCount: 55,
        toolUsePromptTokenCount: 89,
        cachedContentTokenCount: 100,
      }).inputTokens,
    ).toEqual({
      total: 144,
      noCache: 44,
      cacheRead: 100,
      cacheWrite: undefined,
    });
  });
});
