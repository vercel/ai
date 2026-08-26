import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  createNullLanguageModelUsage,
  resolveInputTokenUsage,
} from '@ai-sdk/provider-utils';

export function convertGroqUsage(
  usage:
    | {
        prompt_tokens?: number | null | undefined;
        completion_tokens?: number | null | undefined;
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
    | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const cacheReadTokens =
    usage.prompt_tokens_details?.cached_tokens ?? undefined;
  const completionTokens = usage.completion_tokens ?? 0;
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? undefined;
  const textTokens =
    reasoningTokens != null
      ? Math.max(0, completionTokens - reasoningTokens)
      : completionTokens;

  const { total: totalInputTokens, noCache: noCacheInputTokens } =
    resolveInputTokenUsage({
      reportedInputTokens: promptTokens,
      cachedTokens: cacheReadTokens ?? 0,
    });

  return {
    inputTokens: {
      total: totalInputTokens,
      noCache: noCacheInputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: textTokens,
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
