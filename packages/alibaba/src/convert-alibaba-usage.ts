import type { LanguageModelV2Usage } from '@ai-sdk/provider';

export type AlibabaUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
  } | null;
};

export function convertAlibabaUsage(
  usage: AlibabaUsage | undefined | null,
): LanguageModelV2Usage {
  return {
    inputTokens: usage?.prompt_tokens ?? undefined,
    outputTokens: usage?.completion_tokens ?? undefined,
    totalTokens: usage?.total_tokens ?? undefined,
    reasoningTokens:
      usage?.completion_tokens_details?.reasoning_tokens ?? undefined,
    cachedInputTokens:
      (usage?.prompt_tokens_details?.cached_tokens ?? 0) +
        (usage?.prompt_tokens_details?.cache_creation_input_tokens ?? 0) ||
      undefined,
  };
}
