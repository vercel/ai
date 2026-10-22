import type { LanguageModelV4Usage } from '@ai-sdk/provider';

/**
 * Creates an empty language model usage result for unavailable usage data.
 */
export function createNullLanguageModelUsage(): LanguageModelV4Usage {
  return {
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
  };
}
