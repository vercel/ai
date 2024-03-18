export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
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
