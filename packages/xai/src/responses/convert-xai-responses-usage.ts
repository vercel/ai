import { LanguageModelV3Usage } from '@ai-sdk/provider';
import { XaiResponsesUsage } from './xai-responses-api';

export function convertXaiResponsesUsage(
  usage: XaiResponsesUsage,
): LanguageModelV3Usage {
  const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: usage.input_tokens,
      noCache: usage.input_tokens - cacheReadTokens,
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
