import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export function convertMoonshotAIChatUsage(
  usage:
    | {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        cached_tokens?: number | null;
        prompt_tokens_details?: {
          cached_tokens?: number | null;
          cache_write_tokens?: number | null;
        } | null;
        completion_tokens_details?: {
          reasoning_tokens?: number | null;
        } | null;
      }
    | undefined
    | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;

  const cacheReadTokens =
    usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;

  const cacheWriteTokens = usage.prompt_tokens_details?.cache_write_tokens;

  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens - cacheReadTokens - (cacheWriteTokens ?? 0),
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens ?? undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: Math.max(0, completionTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
