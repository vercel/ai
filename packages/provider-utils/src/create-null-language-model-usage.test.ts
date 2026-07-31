import { describe, expect, it } from 'vitest';
import { createNullLanguageModelUsage } from './create-null-language-model-usage';

describe('createNullLanguageModelUsage', () => {
  it('creates usage with all token counts undefined', () => {
    expect(createNullLanguageModelUsage()).toEqual({
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
      raw: undefined,
    });
  });

  it('creates a fresh usage object', () => {
    const first = createNullLanguageModelUsage();
    const second = createNullLanguageModelUsage();

    expect(first).not.toBe(second);
    expect(first.inputTokens).not.toBe(second.inputTokens);
    expect(first.outputTokens).not.toBe(second.outputTokens);
  });
});
