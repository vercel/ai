import { LanguageModelV2Usage } from '@ai-sdk/provider';

/**
Represents the number of tokens used in a prompt and completion.
 */
export type LanguageModelUsage = {
  /**
The number of tokens used in the prompt.
   */
  promptTokens: number;

  /**
The number of tokens used in the completion.
 */
  completionTokens: number;

  /**
The total number of tokens used (promptTokens + completionTokens).
   */
  totalTokens: number;
};

/**
Represents the number of tokens used in an embedding.
 */
export type EmbeddingModelUsage = {
  /**
The number of tokens used in the embedding.
   */
  tokens: number;
};

export function calculateLanguageModelUsage({
  inputTokens,
  outputTokens,
}: LanguageModelV2Usage): LanguageModelUsage {
  return {
    promptTokens: inputTokens ?? NaN,
    completionTokens: outputTokens ?? NaN,
    totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
  };
}

export function addLanguageModelUsage(
  usage1: LanguageModelUsage,
  usage2: LanguageModelUsage,
): LanguageModelUsage {
  return {
    promptTokens: usage1.promptTokens + usage2.promptTokens,
    completionTokens: usage1.completionTokens + usage2.completionTokens,
    totalTokens: usage1.totalTokens + usage2.totalTokens,
  };
}
