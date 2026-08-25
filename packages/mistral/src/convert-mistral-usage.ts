import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  createNullLanguageModelUsage,
  resolveInputTokenUsage,
} from '@ai-sdk/provider-utils';

export type MistralUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  num_cached_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  prompt_token_details?: { cached_tokens?: number | null } | null;
};

export function convertMistralUsage(
  usage: MistralUsage | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;

  const cacheReadTokens =
    usage.num_cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens ??
    usage.prompt_token_details?.cached_tokens ??
    0;

  const { total: totalInputTokens, noCache: noCacheInputTokens } =
    resolveInputTokenUsage({
      reportedInputTokens: promptTokens,
      cachedTokens: cacheReadTokens,
    });

  return {
    inputTokens: {
      total: totalInputTokens,
      noCache: noCacheInputTokens,
      cacheRead: cacheReadTokens || undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: completionTokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}
