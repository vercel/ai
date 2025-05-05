/**
Usage information for a language model call.
 */
export type LanguageModelV2Usage = {
  /**
The number of input (prompt) tokens used.
   */
  inputTokens: number | undefined;

  /**
The number of output (completion) tokens used.
   */
  outputTokens: number | undefined;

  /**
The total number of tokens as reported by the provider.
This number might be different from the sum of `inputTokens` and `outputTokens`
and e.g. include reasoning tokens or other overhead.
   */
  totalTokens: number | undefined;

  /**
The number of reasoning tokens used.
   */
  reasoningTokens?: number | undefined;

  /**
The number of cached input tokens.
   */
  cachedInputTokens?: number | undefined;
};
