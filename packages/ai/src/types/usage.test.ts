import { describe, expect, it } from 'vitest';
import {
  addLanguageModelUsage,
  createNullLanguageModelUsage,
  type LanguageModelUsage,
} from './usage';

describe('addLanguageModelUsage', () => {
  it('should preserve raw usage when aggregating a single step', () => {
    const usage: LanguageModelUsage = {
      inputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 5,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: 5,
      },
      totalTokens: 15,
      raw: { totalTokens: 20 },
    };

    expect(
      addLanguageModelUsage(createNullLanguageModelUsage(), usage),
    ).toEqual(usage);
  });
});
