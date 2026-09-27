<<<<<<< HEAD
import type { LanguageModelV3Usage } from '@ai-sdk/provider';
=======
import type { JSONObject, LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';
>>>>>>> 38fe0e5997 (feat(provider/perplexity)!: migrate to Agent API (#18991))

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
): LanguageModelV3Usage {
  if (usage == null) {
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

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens =
    usage.input_tokens_details?.cache_read_input_tokens ??
    usage.input_tokens_details?.cached_tokens ??
    0;
  const cacheWriteTokens =
    usage.input_tokens_details?.cache_creation_input_tokens ?? 0;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: inputTokens,
      noCache: Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens),
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
    },
    outputTokens: {
      total: outputTokens,
      text: Math.max(0, outputTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
    raw: usage as JSONObject,
  };
}
