import { JSONObject } from '@ai-sdk/provider';

/**
 * Represents a single iteration in the usage breakdown.
 * When compaction occurs, the API returns an iterations array showing
 * usage for each sampling iteration (compaction + message).
 */
export interface AnthropicUsageIteration {
  type: 'compaction' | 'message';

  /**
   * Number of input tokens consumed in this iteration.
   */
  inputTokens: number;

  /**
   * Number of output tokens generated in this iteration.
   */
  outputTokens: number;
}

export interface AnthropicMessageMetadata {
  usage: JSONObject;
  // TODO remove cacheCreationInputTokens in AI SDK 6
  // (use value in usage object instead)
  cacheCreationInputTokens: number | null;
  stopSequence: string | null;

  /**
   * Usage breakdown by iteration when compaction is triggered.
   *
   * When compaction occurs, this array contains usage for each sampling iteration.
   * The first iteration is typically the compaction step, followed by the main
   * message iteration.
   */
  iterations: AnthropicUsageIteration[] | null;

  /**
   * Information about the container used in this request.
   *
   * This will be non-null if a container tool (e.g., code execution) was used.
   * Information about the container used in the request (for the code execution tool).
   */
  container: {
    /**
     * The time at which the container will expire (RFC3339 timestamp).
     */
    expiresAt: string;

    /**
     * Identifier for the container used in this request.
     */
    id: string;

    /**
     * Skills loaded in the container.
     */
    skills: Array<{
      /**
       * Type of skill: either 'anthropic' (built-in) or 'custom' (user-defined).
       */
      type: 'anthropic' | 'custom';

      /**
       * Skill ID (1-64 characters).
       */
      skillId: string;

      /**
       * Skill version or 'latest' for most recent version (1-64 characters).
       */
      version: string;
    }> | null;
  } | null;

  /**
   * Information about context management operations applied to this request.
   */
  contextManagement: {
    /**
     * List of context management edits that were applied.
     */
    appliedEdits: Array<
      | {
          /**
           * The type of context management edit applied.
           * Possible value: 'clear_01'
           */
          type: 'clear_01';

          /**
           * The number of input tokens that were cleared.
           */
          clearedInputTokens: number;
        }
      /**
       * Represents a compaction edit where the conversation context was summarized.
       */
      | {
          /**
           * The type of context management edit applied.
           * Possible value: 'compact_20260112'
           */
          type: 'compact_20260112';
        }
    >;
  } | null;
}
