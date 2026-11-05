import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export type CohereUsageTokens = {
  input_tokens?: number | null;
  output_tokens?: number | null;
};

export type CohereUsage = {
  billed_units?: CohereUsageTokens | null;
  tokens?: CohereUsageTokens | null;
  cached_tokens?: number | null;
};

export function convertCohereUsage(
  usage: CohereUsage | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  // `tokens` is not guaranteed by the API; fall back to the billed units.
  const inputTokens =
    usage.tokens?.input_tokens ?? usage.billed_units?.input_tokens;
  const outputTokens =
    usage.tokens?.output_tokens ?? usage.billed_units?.output_tokens;
  const cacheReadTokens = usage.cached_tokens ?? undefined;

  return {
    inputTokens: {
      total: inputTokens ?? undefined,
      noCache:
        inputTokens != null && cacheReadTokens != null
          ? inputTokens - cacheReadTokens
          : (inputTokens ?? undefined),
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens ?? undefined,
      text: outputTokens ?? undefined,
      reasoning: undefined,
    },
    raw: usage,
  };
}
