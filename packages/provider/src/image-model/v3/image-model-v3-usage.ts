/**
 * Usage information for an image model call.
 */
export type ImageModelV3Usage = {
  /**
   * The number of input (prompt) tokens used.
   */
  inputTokens: number | undefined;

  /**
   * Detailed breakdown of input tokens by type.
   */
  inputTokensDetails?: {
    /**
     * The number of image input tokens used.
     */
    imageTokens: number | undefined;

    /**
     * The number of text input tokens used.
     */
    textTokens: number | undefined;
  };

  /**
   * The number of output tokens used, if reported by the provider.
   */
  outputTokens: number | undefined;

  /**
   * The total number of tokens as reported by the provider.
   */
  totalTokens: number | undefined;
};
