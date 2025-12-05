import { JSONObject } from '@ai-sdk/provider';

export type AnthropicToolCallCaller =
  | {
      /**
       * Direct invocation by Claude.
       */
      type: 'direct';
    }
  | {
      /**
       * Programmatic invocation from within code execution.
       */
      type: 'code_execution_20250825';
      /**
       * The ID of the code execution tool that made the programmatic call.
       */
      toolId: string;
    };

/**
 * Anthropic-specific metadata for tool calls.
 */
export interface AnthropicToolCallMetadata {
  /**
   * Information about how the tool was called.
   * Present when programmatic tool calling is used.
   */
  caller?: AnthropicToolCallCaller;
}

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
}
