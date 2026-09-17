import { describe, expect, it } from 'vitest';
import { convertGoogleUsage } from './convert-google-usage';

describe('convertGoogleUsage', () => {
  it('includes tool-use prompt tokens in input usage', () => {
    expect(
      convertGoogleUsage({
        promptTokenCount: 12,
        toolUsePromptTokenCount: 65,
        cachedContentTokenCount: 4,
      }),
    ).toMatchObject({
      inputTokens: {
        total: 77,
        noCache: 73,
        cacheRead: 4,
      },
    });
  });
});
