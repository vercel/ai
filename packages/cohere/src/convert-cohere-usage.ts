import type { LanguageModelV3Usage } from '@ai-sdk/provider';

export type CohereUsageTokens = {
  input_tokens: number;
  output_tokens: number;
};

export type CohereUsage = {
  billed_units?: CohereUsageTokens | null;
  tokens: CohereUsageTokens;
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

  const tokens = usage.tokens;
  const inputTokens = tokens.input_tokens;
  const outputTokens = tokens.output_tokens;

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
