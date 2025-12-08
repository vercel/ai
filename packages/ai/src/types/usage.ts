import { ImageModelV3Usage, JSONObject } from '@ai-sdk/provider';

/**
 * Represents the number of tokens used in a prompt and completion.
 */
export type LanguageModelUsage = {
  /**
   * The number of input (prompt) tokens used.
   */
  inputTokens: number | undefined;

  /**
   * Detailed information about the input tokens.
   */
  inputTokenDetails?: {
    /**
     * The total number of input (prompt) tokens used.
     */
    totalTokens: number | undefined;

    /**
     * The number of non-cached input (prompt) tokens used.
     */
    noCacheTokens: number | undefined;

    /**
     * The number of cached input (prompt) tokens read.
     */
    cacheReadTokens: number | undefined;

    /**
     * The number of cached input (prompt) tokens written.
     */
    cacheWriteTokens: number | undefined;
  };

  /**
   * The number of output (completion) tokens used.
   */
  outputTokens: number | undefined;

  /**
   * Detailed information about the output tokens.
   */
  outputTokenDetails?: {
    /**
     * The total number of output (completion) tokens used.
     */
    totalTokens: number | undefined;

    /**
     * The number of text tokens used.
     */
    textTokens: number | undefined;

    /**
     * The number of reasoning tokens used.
     */
    reasoningTokens: number | undefined;
  };

  /**
   * The total number of tokens used.
   */
  totalTokens: number | undefined;

  /**
   * @deprecated Use outputTokenDetails.reasoning instead.
   */
  reasoningTokens?: number | undefined;

  /**
   * @deprecated Use inputTokenDetails.cacheRead instead.
   */
  cachedInputTokens?: number | undefined;

  /**
   * Raw usage information from the provider.
   *
   * This is the usage information in the shape that the provider returns.
   * It can include additional information that is not part of the standard usage information.
   */
  raw?: JSONObject;
};

/**
Represents the number of tokens used in an embedding.
 */
// TODO replace with EmbeddingModelV3Usage
export type EmbeddingModelUsage = {
  /**
The number of tokens used in the embedding.
   */
  tokens: number;
};

export function addLanguageModelUsage(
  usage1: LanguageModelUsage,
  usage2: LanguageModelUsage,
): LanguageModelUsage {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    inputTokenDetails: {
      totalTokens: addTokenCounts(
        usage1.inputTokenDetails?.totalTokens,
        usage2.inputTokenDetails?.totalTokens,
      ),
      noCacheTokens: addTokenCounts(
        usage1.inputTokenDetails?.noCacheTokens,
        usage2.inputTokenDetails?.noCacheTokens,
      ),
      cacheReadTokens: addTokenCounts(
        usage1.inputTokenDetails?.cacheReadTokens,
        usage2.inputTokenDetails?.cacheReadTokens,
      ),
      cacheWriteTokens: addTokenCounts(
        usage1.inputTokenDetails?.cacheWriteTokens,
        usage2.inputTokenDetails?.cacheWriteTokens,
      ),
    },
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    outputTokenDetails: {
      totalTokens: addTokenCounts(
        usage1.outputTokenDetails?.totalTokens,
        usage2.outputTokenDetails?.totalTokens,
      ),
      textTokens: addTokenCounts(
        usage1.outputTokenDetails?.textTokens,
        usage2.outputTokenDetails?.textTokens,
      ),
      reasoningTokens: addTokenCounts(
        usage1.outputTokenDetails?.reasoningTokens,
        usage2.outputTokenDetails?.reasoningTokens,
      ),
    },
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
    reasoningTokens: addTokenCounts(
      usage1.reasoningTokens,
      usage2.reasoningTokens,
    ),
    cachedInputTokens: addTokenCounts(
      usage1.cachedInputTokens,
      usage2.cachedInputTokens,
    ),
  };
}

function addTokenCounts(
  tokenCount1: number | undefined,
  tokenCount2: number | undefined,
): number | undefined {
  return tokenCount1 == null && tokenCount2 == null
    ? undefined
    : (tokenCount1 ?? 0) + (tokenCount2 ?? 0);
}

/**
Usage information for an image model call.
 */
export type ImageModelUsage = ImageModelV3Usage;

export function addImageModelUsage(
  usage1: ImageModelUsage,
  usage2: ImageModelUsage,
): ImageModelUsage {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
  };
}
