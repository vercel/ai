import type { LanguageModelV3Usage } from '@ai-sdk/provider';

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
): LanguageModelV3Usage {
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

  // `tokens` is the only measure that matches the unified token counts.
  // `billed_units` count billed units rather than tokens, so they are kept in
  // `raw` only and never used as token counts.
  const inputTokens = usage.tokens?.input_tokens ?? undefined;
  const outputTokens = usage.tokens?.output_tokens ?? undefined;

  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens,
      cacheRead: undefined,
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
