import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export type CohereUsageTokens = {
  input_tokens: number;
  output_tokens: number;
};

export function convertCohereUsage(
  tokens: CohereUsageTokens | undefined | null,
): LanguageModelV4Usage {
  if (tokens == null) {
    return createNullLanguageModelUsage();
  }

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
    raw: tokens,
  };
}
