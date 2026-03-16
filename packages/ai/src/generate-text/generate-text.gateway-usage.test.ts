import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { asLanguageModelUsage } from '../types/usage';

describe('generateText + gateway usage normalization (unit)', () => {
  it('maps normalized gateway V3 usage into LanguageModelUsage with totals populated', () => {
    const normalizedGatewayUsage: LanguageModelV3Usage = {
      inputTokens: {
        total: 9,
        noCache: undefined,
        cacheRead: 2,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 11,
        text: undefined,
        reasoning: 1,
      },
      raw: {
        inputTokens: 9,
        outputTokens: 11,
        totalTokens: 20,
        reasoningTokens: 1,
        cachedInputTokens: 2,
      },
    };

    const usage = asLanguageModelUsage(normalizedGatewayUsage);

    expect(usage).toEqual({
      inputTokens: 9,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: 2,
        cacheWriteTokens: undefined,
      },
      outputTokens: 11,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: 1,
      },
      totalTokens: 20,
      raw: normalizedGatewayUsage.raw,
      reasoningTokens: 1,
      cachedInputTokens: 2,
    });
  });
});
