import { describe, expect, it } from 'vitest';
import { asLanguageModelUsage, createNullLanguageModelUsage } from './usage';

describe('asLanguageModelUsage', () => {
  it('maps a fully populated provider usage object', () => {
    const result = asLanguageModelUsage({
      inputTokens: {
        total: 100,
        noCache: 80,
        cacheRead: 15,
        cacheWrite: 5,
      },
      outputTokens: {
        total: 50,
        text: 40,
        reasoning: 10,
      },
      raw: { provider_specific: 'value' },
    });

    expect(result).toEqual({
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 80,
        cacheReadTokens: 15,
        cacheWriteTokens: 5,
      },
      outputTokens: 50,
      outputTokenDetails: {
        textTokens: 40,
        reasoningTokens: 10,
      },
      totalTokens: 150,
      raw: { provider_specific: 'value' },
    });
  });

  // Regression test for https://github.com/vercel/ai/issues/15446.
  // Some providers omit `usage.inputTokens` / `usage.outputTokens` entirely
  // (rather than emitting the documented `{ total: undefined, ... }` shape).
  // The conversion must not throw — it should fall back to undefined fields.
  it('does not throw when inputTokens or outputTokens is missing', () => {
    expect(() =>
      asLanguageModelUsage({
        inputTokens: undefined as never,
        outputTokens: undefined as never,
      }),
    ).not.toThrow();

    const result = asLanguageModelUsage({
      inputTokens: undefined as never,
      outputTokens: undefined as never,
    });

    expect(result).toEqual({
      inputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: undefined,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: undefined,
      raw: undefined,
    });
  });

  it('handles only inputTokens missing', () => {
    const result = asLanguageModelUsage({
      inputTokens: undefined as never,
      outputTokens: {
        total: 42,
        text: 42,
        reasoning: undefined,
      },
    });

    expect(result.inputTokens).toBeUndefined();
    expect(result.outputTokens).toBe(42);
    expect(result.totalTokens).toBe(42);
  });
});

describe('createNullLanguageModelUsage', () => {
  it('returns an all-undefined usage shape', () => {
    expect(createNullLanguageModelUsage()).toEqual({
      inputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: undefined,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: undefined,
    });
  });
});
