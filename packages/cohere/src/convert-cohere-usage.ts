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

  // `tokens` is the only measure that matches the unified token counts.
  // `billed_units` count billed units rather than tokens, so they are kept in
  // `raw` only and never used as token counts or reduced by cached tokens.
  const inputTokens = usage.tokens?.input_tokens ?? undefined;
  const outputTokens = usage.tokens?.output_tokens ?? undefined;
  const cacheReadTokens = usage.cached_tokens ?? undefined;

  return {
    inputTokens: {
      total: inputTokens,
      noCache:
        inputTokens != null && cacheReadTokens != null
          ? inputTokens - cacheReadTokens
          : inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}
