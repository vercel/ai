import { LanguageModelV2Usage } from '@ai-sdk/provider';
import { XaiResponsesUsage } from './xai-responses-api';

export function convertXaiResponsesUsage(
  usage: XaiResponsesUsage | undefined | null,
): LanguageModelV2Usage {
  if (usage == null) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

  const inputTokensIncludesCached = cacheReadTokens <= usage.input_tokens;

  return {
    inputTokens: inputTokensIncludesCached
      ? usage.input_tokens
      : usage.input_tokens + cacheReadTokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    reasoningTokens: reasoningTokens || undefined,
    cachedInputTokens: cacheReadTokens || undefined,
  };
}
