import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

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
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
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
