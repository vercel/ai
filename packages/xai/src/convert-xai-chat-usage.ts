import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { resolveInputTokenUsage } from '@ai-sdk/provider-utils';
import type { XaiChatUsage } from './xai-chat-language-model';

export function convertXaiChatUsage(usage: XaiChatUsage): LanguageModelV4Usage {
  const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? 0;

  const { total: totalInputTokens, noCache: noCacheInputTokens } =
    resolveInputTokenUsage({
      reportedInputTokens: usage.prompt_tokens,
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
      total: usage.completion_tokens + reasoningTokens,
      text: usage.completion_tokens,
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}
