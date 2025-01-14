/**
Base usage metrics that all language models must provide
*/
export interface BaseLanguageModelUsage {
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
}

export interface ExtendedLanguageModelUsage extends BaseLanguageModelUsage {
  [key: string]: number; // Allow any additional numeric metrics
}

/**
Represents the number of tokens used in a prompt and completion.
Can be extended with additional provider-specific metrics.
*/
export type LanguageModelUsage<
  USAGE extends BaseLanguageModelUsage = ExtendedLanguageModelUsage,
> = USAGE;

/**
Represents the number of tokens used in an embedding.
 */
export type EmbeddingModelUsage = {
  /**
The number of tokens used in the embedding.
   */
  tokens: number;
};

export function calculateLanguageModelUsage<
  T extends BaseLanguageModelUsage = ExtendedLanguageModelUsage,
>(usage: Partial<T> | null | undefined): T {
  const promptTokens = usage?.promptTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;

  return {
    ...usage, // Preserve any additional fields
    promptTokens,
    completionTokens,
    totalTokens,
  } as T;
}

export function addLanguageModelUsage<
  T extends BaseLanguageModelUsage = ExtendedLanguageModelUsage,
>(usage1: T, usage2: T): T {
  return {
    ...usage1, // Preserve additional fields from first usage
    ...usage2, // Preserve additional fields from second usage (overwriting first)
    promptTokens: usage1.promptTokens + usage2.promptTokens,
    completionTokens: usage1.completionTokens + usage2.completionTokens,
    totalTokens: usage1.totalTokens + usage2.totalTokens,
  } as T;
}
