/**
 * Usage information for a video model call.
 */
export type VideoModelV3Usage = {
  /**
   * The number of input (prompt) tokens used.
   */
  inputTokens: number | undefined;

  /**
   * The number of output tokens used, if reported by the provider.
   */
  outputTokens: number | undefined;

  /**
   * The total number of tokens as reported by the provider.
   */
  totalTokens: number | undefined;
};
