import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

/**
 * Usage as reported by Alibaba's OpenAI-compatible chat completions API.
 *
 * The fields below are the ones this provider maps onto the standard usage
 * shape. Alibaba returns more than this, and `alibabaUsageSchema` parses
 * loosely so that anything undeclared survives into `raw` rather than being
 * dropped. Declared fields are therefore a subset of what a caller may find
 * there.
 */
export type AlibabaUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    /**
     * Which caching mode served the request. Alibaba populates this only under
     * explicit context caching, which sending `cache_control` selects; under
     * implicit caching the field is absent. The two modes are mutually
     * exclusive and priced differently, so this is the discriminator for
     * attributing cache reads to a rate.
     */
    cache_type?: string | null;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
  } | null;
};

export function convertAlibabaUsage(
  usage: AlibabaUsage | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens =
    usage.prompt_tokens_details?.cache_creation_input_tokens ?? 0;
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: promptTokens,
      // Alibaba counts both cache reads and cache writes inside prompt_tokens.
      noCache: promptTokens - cacheReadTokens - cacheWriteTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
    },
    outputTokens: {
      total: completionTokens,
      text: Math.max(0, completionTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
