import { LanguageModelV2Usage } from '@ai-sdk/provider';

export type XaiChatUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
  } | null;
};

export function convertXaiChatUsage(
  usage: XaiChatUsage | undefined | null,
): LanguageModelV2Usage {
  if (usage == null) {
    return {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    };
  }

  const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? 0;

  const promptTokensIncludesCached = cacheReadTokens <= usage.prompt_tokens;

  return {
    inputTokens: promptTokensIncludesCached
      ? usage.prompt_tokens
      : usage.prompt_tokens + cacheReadTokens,
    outputTokens: usage.completion_tokens + reasoningTokens,
    totalTokens: usage.total_tokens,
    reasoningTokens: reasoningTokens || undefined,
    cachedInputTokens: cacheReadTokens || undefined,
  };
}
