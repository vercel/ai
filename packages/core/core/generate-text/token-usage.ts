/**
Represents the number of tokens used in a prompt and completion.
 */
export type TokenUsage = {
  /**
The number of tokens used in the prompt
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

export function calculateTokenUsage(usage: {
  promptTokens: number;
  completionTokens: number;
}): TokenUsage {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens,
  };
}
