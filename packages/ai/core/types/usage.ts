import { LanguageModelV2Usage } from '@ai-sdk/provider';

/**
Represents the number of tokens used in a prompt and completion.
 */
export type LanguageModelUsage = LanguageModelV2Usage;

/**
Represents the number of tokens used in an embedding.
 */
// TODO replace with EmbeddingModelV2Usage
export type EmbeddingModelUsage = {
  /**
The number of tokens used in the embedding.
   */
  tokens: number;
};

export function addLanguageModelUsage(
  usage1: LanguageModelUsage,
  usage2: LanguageModelUsage,
): LanguageModelUsage {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
    reasoningTokens: addTokenCounts(
      usage1.reasoningTokens,
      usage2.reasoningTokens,
    ),
    cachedInputTokens: addTokenCounts(
      usage1.cachedInputTokens,
      usage2.cachedInputTokens,
    ),
  };
}

function addTokenCounts(
  tokenCount1: number | undefined,
  tokenCount2: number | undefined,
): number | undefined {
  return tokenCount1 == null && tokenCount2 == null
    ? undefined
    : (tokenCount1 ?? 0) + (tokenCount2 ?? 0);
}
