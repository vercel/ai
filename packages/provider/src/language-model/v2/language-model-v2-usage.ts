/**
 * Represents the usage statistics for a language model request.
 */
export type LanguageModelV2Usage = {
  /**
   * The number of tokens in the input.
   */
  inputTokens: number | undefined;

  /**
   * The number of tokens in the completion (generated output).
   */
  outputTokens: number | undefined;
};
