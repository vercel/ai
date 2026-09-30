import type { LanguageModelV2Usage } from '@ai-sdk/provider';

export function convertPerplexityUsage(
  usage:
    | {
        input_tokens?: number | null;
        output_tokens?: number | null;
        total_tokens?: number | null;
        input_tokens_details?: {
          cached_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
          cache_read_input_tokens?: number | null;
        } | null;
        output_tokens_details?: {
          reasoning_tokens?: number | null;
        } | null;
        [key: string]: unknown;
      }
    | undefined
    | null,
): LanguageModelV2Usage {
  if (usage == null) {
    return {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
  }

  const inputTokens = usage.input_tokens ?? undefined;
  const outputTokens = usage.output_tokens ?? undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      usage.total_tokens ??
      (inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : undefined),
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? undefined,
    cachedInputTokens:
      usage.input_tokens_details?.cache_read_input_tokens ??
      usage.input_tokens_details?.cached_tokens ??
      undefined,
  };
}
