/**
 * Represents the usage statistics for a language model request.
 */
export type LanguageModelV2Usage = {
  /**
   * The number of tokens in the input.
   */
  inputTokens: number | undefined;

  /**
   * Number of input tokens that have been read from a cached context.
   */
  inputTokensReadFromCache: number | undefined;

  /**
   * Number of input tokens that have been written to a cached context.
   */
  inputTokensWrittenToCache: number | undefined;

  /**
   * The number of tokens in the completion (generated output).
   */
  outputTokens: number | undefined;
};
