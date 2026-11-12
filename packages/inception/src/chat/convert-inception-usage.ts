import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export function convertInceptionUsage(
  usage:
    | {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        prompt_tokens_details?: { cached_tokens?: number | null } | null;
        completion_tokens_details?: { reasoning_tokens?: number | null } | null;
        reasoning_tokens?: number | null;
        cached_input_tokens?: number | null;
      }
    | null
    | undefined,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  // The API reference also shows responses with these counts at the top level.
  const cacheRead =
    usage.prompt_tokens_details?.cached_tokens ??
    (typeof usage.cached_input_tokens === 'number'
      ? usage.cached_input_tokens
      : 0);
  const reasoning =
    usage.completion_tokens_details?.reasoning_tokens ??
    (typeof usage.reasoning_tokens === 'number' ? usage.reasoning_tokens : 0);

  return {
    inputTokens: {
      total: usage.prompt_tokens ?? undefined,
      noCache:
        usage.prompt_tokens != null
          ? usage.prompt_tokens - cacheRead
          : undefined,
      cacheRead,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.completion_tokens ?? undefined,
      text:
        usage.completion_tokens != null
          ? Math.max(0, usage.completion_tokens - reasoning)
          : undefined,
      reasoning,
    },
    raw: usage,
  };
}
