import { LanguageModelV2Usage } from '@ai-sdk/provider';

export function convertMoonshotAIChatUsage(
  usage:
    | {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        total_tokens?: number | null;
        cached_tokens?: number | null;
        prompt_tokens_details?: {
          cached_tokens?: number | null;
        } | null;
        completion_tokens_details?: {
          reasoning_tokens?: number | null;
        } | null;
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

  const cachedInputTokens =
    usage.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens ??
    undefined;

  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? undefined;

  return {
    inputTokens: usage.prompt_tokens ?? undefined,
    outputTokens: usage.completion_tokens ?? undefined,
    totalTokens: usage.total_tokens ?? undefined,
    reasoningTokens,
    cachedInputTokens,
  };
}
