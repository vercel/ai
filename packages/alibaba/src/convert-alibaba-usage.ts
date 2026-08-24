import { convertOpenAICompatibleChatUsage } from '@ai-sdk/openai-compatible/internal';
import type { LanguageModelV3Usage } from '@ai-sdk/provider';

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
): LanguageModelV3Usage {
  const baseUsage = convertOpenAICompatibleChatUsage(usage);

  const cacheWriteTokens =
    usage?.prompt_tokens_details?.cache_creation_input_tokens ?? 0;
  const noCacheTokens =
    (baseUsage.inputTokens.total ?? 0) -
    (baseUsage.inputTokens.cacheRead ?? 0) -
    cacheWriteTokens;

  return {
    ...baseUsage,
    inputTokens: {
      ...baseUsage.inputTokens,
      cacheWrite: cacheWriteTokens,
      noCache: noCacheTokens,
    },
<<<<<<< HEAD
=======
    outputTokens: {
      total: completionTokens,
      text: Math.max(0, completionTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
    raw: usage,
>>>>>>> 221425865d (fix: prevent negative text output token counts when reasoning exceeds completion usage (#19316))
  };
}
