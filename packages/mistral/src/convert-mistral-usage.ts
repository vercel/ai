import type { LanguageModelV4Usage } from '@ai-sdk/provider';

export type MistralUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  num_cached_tokens?: number | null;
  prompt_token_details?: {
    cached_tokens?: number | null;
  } | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
};

export function convertMistralUsage(
  usage: MistralUsage | undefined | null,
): LanguageModelV4Usage {
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

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const cachedPromptTokens = getCachedPromptTokens(usage, promptTokens);

  return {
    inputTokens: {
      total: promptTokens,
      noCache:
        cachedPromptTokens == null
          ? promptTokens
          : promptTokens - cachedPromptTokens,
      cacheRead: cachedPromptTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: completionTokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}

function getCachedPromptTokens(
  usage: MistralUsage,
  promptTokens: number,
): number | undefined {
  const cachedTokens =
    usage.num_cached_tokens ??
    usage.prompt_token_details?.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens;

  if (cachedTokens == null) {
    return undefined;
  }

  return Math.min(Math.max(cachedTokens, 0), promptTokens);
}
