import type { JSONObject } from '@ai-sdk/provider';

/**
 * Represents a single iteration in the usage breakdown.
 *
 * The API returns an iterations array showing usage for each sampling
 * iteration. Iterations can be:
 * - `compaction`: a context compaction step (billed at executor rates).
 * - `message`: an executor sampling iteration (billed at executor rates).
 * - `advisor_message`: an advisor sub-inference (billed at the advisor
 *   model's rates; `model` carries the advisor model ID). Advisor token
 *   usage is NOT rolled into the top-level usage totals because it bills
 *   at a different rate; inspect this array directly for advisor billing.
 */
export type AnthropicUsageIteration =
  | {
      type: 'compaction' | 'message';

      /**
       * Number of input tokens consumed in this iteration.
       */
      inputTokens: number;

      /**
       * Number of output tokens generated in this iteration.
       */
      outputTokens: number;

      /**
       * Number of cache-creation input tokens consumed in this iteration.
       */
      cacheCreationInputTokens?: number;

      /**
       * Number of cache-read input tokens consumed in this iteration.
       */
      cacheReadInputTokens?: number;
    }
  | {
      type: 'advisor_message';

      /**
       * The advisor model that produced this iteration.
       */
      model: string;

      /**
       * Number of input tokens consumed in this iteration.
       */
      inputTokens: number;

      /**
       * Number of output tokens generated in this iteration.
       */
      outputTokens: number;

      /**
       * Number of cache-creation input tokens consumed by this advisor
       * sub-inference. Nonzero when advisor-side caching is enabled and
       * the advisor writes a fresh cache entry.
       */
      cacheCreationInputTokens?: number;

      /**
       * Number of cache-read input tokens consumed by this advisor
       * sub-inference. Nonzero on the second and later advisor calls
       * when advisor-side caching is enabled.
       */
      cacheReadInputTokens?: number;
    };

export interface AnthropicMessageMetadata {
  usage: JSONObject;
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
   * Context management response.
   *
   * Information about context management strategies applied during the request.
   */
  contextManagement: {
    /**
     * List of context management edits that were applied.
     * Each item in the array is a specific type of context management edit.
     */
    appliedEdits: Array<
      /**
       * Represents an edit where a certain number of tool uses and input tokens were cleared.
       */
      | {
          /**
           * The type of context management edit applied.
           * Possible value: 'clear_tool_uses_20250919'
           */
          type: 'clear_tool_uses_20250919';

          /**
           * Number of tool uses that were cleared by this edit.
           * Minimum: 0
           */
          clearedToolUses: number;

          /**
           * Number of input tokens cleared by this edit.
           * Minimum: 0
           */
          clearedInputTokens: number;
        }
      /**
       * Represents an edit where a certain number of thinking turns and input tokens were cleared.
       */
      | {
          /**
           * The type of context management edit applied.
           * Possible value: 'clear_thinking_20251015'
           */
          type: 'clear_thinking_20251015';

          /**
           * Number of thinking turns that were cleared by this edit.
           * Minimum: 0
           */
          clearedThinkingTurns: number;

          /**
           * Number of input tokens cleared by this edit.
           * Minimum: 0
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
