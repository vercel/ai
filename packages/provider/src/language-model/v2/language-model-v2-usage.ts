/**
 * Usage information for a language model call.
 */
export type LanguageModelV2Usage = {
  /**
   * The number of input (prompt) tokens used.
   */
  inputTokens: number | undefined;

  /**
   * The number of output (completion) tokens used.
   */
  outputTokens: number | undefined;
};
