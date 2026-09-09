import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export function convertPerplexityUsage(
  usage:
    | {
        prompt_tokens?: number | null | undefined;
        completion_tokens?: number | null | undefined;
        reasoning_tokens?: number | null | undefined;
      }
    | undefined
    | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      // Perplexity reports reasoning tokens separately from completion tokens.
      total: completionTokens + reasoningTokens,
      text: completionTokens,
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
