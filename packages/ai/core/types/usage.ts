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
Represents the number of tokens used in a prompt and completion.

@deprecated Use `LanguageModelUsage` instead.
 */
export type CompletionTokenUsage = LanguageModelUsage;

/**
Represents the number of tokens used in an embedding.
 */
export type EmbeddingModelUsage = {
  /**
The number of tokens used in the embedding.
   */
  tokens: number;
};

/**
Represents the number of tokens used in an embedding.

@deprecated Use `EmbeddingModelUsage` instead.
 */
export type EmbeddingTokenUsage = EmbeddingModelUsage;

export function calculateLanguageModelUsage(usage: {
  promptTokens: number;
  completionTokens: number;
}): LanguageModelUsage {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens,
  };
}
