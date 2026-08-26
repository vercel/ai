import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { resolveInputTokenUsage } from '@ai-sdk/provider-utils';
import type { XaiResponsesUsage } from './xai-responses-api';

export function convertXaiResponsesUsage(
  usage: XaiResponsesUsage,
): LanguageModelV4Usage {
  const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

  const { total: totalInputTokens, noCache: noCacheInputTokens } =
    resolveInputTokenUsage({
      reportedInputTokens: usage.input_tokens,
      cachedTokens: cacheReadTokens,
    });

  return {
    inputTokens: {
      total: totalInputTokens,
      noCache: noCacheInputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.output_tokens,
      text: usage.output_tokens - reasoningTokens,
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
