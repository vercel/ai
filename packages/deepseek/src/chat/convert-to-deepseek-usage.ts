import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export type DeepSeekCacheUsageFormat = 'deepseek' | 'openai-compatible';

type DeepSeekUsage =
  | {
      prompt_tokens?: number | null | undefined;
      completion_tokens?: number | null | undefined;
      prompt_cache_hit_tokens?: number | null | undefined;
      prompt_tokens_details?:
        | {
            cached_tokens?: number | null | undefined;
          }
        | null
        | undefined;
      completion_tokens_details?:
        | {
            reasoning_tokens?: number | null | undefined;
          }
        | null
        | undefined;
    }
  | undefined
  | null;

export function getDeepSeekCacheReadTokens(
  usage: DeepSeekUsage,
  cacheUsageFormat: DeepSeekCacheUsageFormat = 'deepseek',
): number | undefined {
  return (
    usage?.prompt_cache_hit_tokens ??
    (cacheUsageFormat === 'openai-compatible'
      ? usage?.prompt_tokens_details?.cached_tokens
      : undefined) ??
    undefined
  );
}

export function convertDeepSeekUsage(
  usage: DeepSeekUsage,
  cacheUsageFormat: DeepSeekCacheUsageFormat = 'deepseek',
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const cacheReadTokens =
    getDeepSeekCacheReadTokens(usage, cacheUsageFormat) ?? 0;
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens - cacheReadTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: Math.max(0, completionTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
