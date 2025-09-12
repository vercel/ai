/**
 * Usage information for an image generation call.
 */
export type ImageModelV2Usage = {
    /**
     * The number of input tokens used for the prompt.
     */
    inputTokens: number | undefined;

    /**
     * The number of output tokens used for the prompt.
     */
    outputTokens: number | undefined;

    /**
     * The total number of tokens used for the prompt.
     */
    totalTokens: number | undefined;
    /**
     * The input token details for the prompt.
     */
    inputTokenDetails: {
        /** 
         * Text tokens used for the prompt.
         */
        textTokens: number | undefined;

        /**
         * Image tokens used for the prompt.
         */
        imageTokens: number | undefined;
    }
}