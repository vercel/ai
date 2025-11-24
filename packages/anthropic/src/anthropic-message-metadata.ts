import { JSONObject } from '@ai-sdk/provider';

export interface AnthropicMessageMetadata {
  usage: JSONObject;
  // TODO remove cacheCreationInputTokens in AI SDK 6
  // (use value in usage object instead)
  cacheCreationInputTokens: number | null;
  stopSequence: string | null;

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

  contextManagement: {
    appliedEdits: Array<
      | {
        type: 'clear_tool_uses_20250919';
        clearedToolUses: number;
        clearedInputTokens: number;
      }
      | {
        type: 'clear_thinking_20251015';
        clearedThinkingTurns: number;
        clearedInputTokens: number;
      }
    >;
  } | null;
}
