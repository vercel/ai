import type {
  JSONObject,
  JSONValue,
  SerializableValue,
} from '@ai-sdk/provider';
import type { HarnessV2EffectError } from './harness-v2-effect';

/**
 * Provider-scoped metadata emitted with harness stream events.
 */
export type HarnessV2Metadata = Record<string, Record<string, JSONValue>>;

/**
 * Reason a model step or turn finished: a unified reason that is the same
 * across harnesses, plus the raw reason reported by the runtime.
 */
export type HarnessV2FinishReason = {
  /**
   * Unified finish reason:
   * - `stop`: the model generated a stop sequence
   * - `length`: the model reached its maximum number of tokens
   * - `content-filter`: a content filter stopped the model
   * - `tool-calls`: the model triggered tool calls
   * - `error`: the model or runtime stopped because of an error
   * - `interrupted`: the stream ended without a completion signal; output may
   *   be incomplete
   * - `other`: the model stopped for another reason
   */
  unified:
    | 'stop'
    | 'length'
    | 'content-filter'
    | 'tool-calls'
    | 'error'
    | 'interrupted'
    | 'other';

  /**
   * Raw finish reason as reported by the runtime or provider.
   */
  raw: string | undefined;
};

/**
 * Token usage of a model step or turn.
 */
export type HarnessV2Usage = {
  /**
   * Input (prompt) token counts.
   */
  inputTokens: {
    /**
     * Total number of input tokens.
     */
    total: number | undefined;

    /**
     * Number of non-cached input tokens.
     */
    noCache: number | undefined;

    /**
     * Number of cached input tokens read.
     */
    cacheRead: number | undefined;

    /**
     * Number of cached input tokens written.
     */
    cacheWrite: number | undefined;
  };

  /**
   * Output (completion) token counts.
   */
  outputTokens: {
    /**
     * Total number of output tokens.
     */
    total: number | undefined;

    /**
     * Number of text tokens.
     */
    text: number | undefined;

    /**
     * Number of reasoning tokens.
     */
    reasoning: number | undefined;
  };

  /**
   * Usage in the shape the runtime or provider reports it, which may include
   * information beyond the standard fields.
   */
  raw?: JSONObject;
};

/**
 * Begins streaming a tool call's input.
 */
export type HarnessV2ToolInputStart = {
  /**
   * Begins streaming a tool call's input.
   */
  type: 'tool-input-start';

  /**
   * Identifier pairing this start with its deltas and end event.
   */
  id: string;

  /**
   * Name of the tool whose input is streamed.
   */
  toolName: string;

  /**
   * Encoding of the input deltas, JSON when omitted. Text deltas concatenate
   * to a raw string; the final tool-call input is still JSON-encoded.
   */
  inputEncoding?: 'json' | 'text';

  /**
   * Optional provider metadata associated with the start event.
   */
  providerMetadata?: Record<string, JSONObject>;

  /**
   * Whether the harness executes the tool itself.
   */
  providerExecuted?: boolean;

  /**
   * Whether the tool is defined at runtime, e.g. an MCP tool.
   */
  dynamic?: boolean;

  /**
   * Optional human-readable title of the tool call.
   */
  title?: string;
};

/**
 * Emits a delta of a tool call's input.
 */
export type HarnessV2ToolInputDelta = {
  /**
   * Emits a delta of a tool call's input.
   */
  type: 'tool-input-delta';

  /**
   * Identifier of the tool input being streamed.
   */
  id: string;

  /**
   * Input fragment to append.
   */
  delta: string;

  /**
   * Optional provider metadata associated with the delta.
   */
  providerMetadata?: Record<string, JSONObject>;
};

/**
 * Marks the end of a tool call's input stream.
 */
export type HarnessV2ToolInputEnd = {
  /**
   * Marks the end of a tool call's input stream.
   */
  type: 'tool-input-end';

  /**
   * Identifier of the tool input being closed.
   */
  id: string;

  /**
   * Optional provider metadata associated with the end event.
   */
  providerMetadata?: Record<string, JSONObject>;
};

/**
 * A complete tool call.
 */
export type HarnessV2ToolCall = {
  /**
   * Reports a complete tool call.
   */
  type: 'tool-call';

  /**
   * Identifier of the tool call, unique across all tool calls.
   */
  toolCallId: string;

  /**
   * Name of the tool to call.
   */
  toolName: string;

  /**
   * JSON-encoded tool input, matching the tool's input schema.
   */
  input: string;

  /**
   * Whether the harness executes the tool itself.
   */
  providerExecuted?: boolean;

  /**
   * Whether the tool is defined at runtime, e.g. an MCP tool.
   */
  dynamic?: boolean;

  /**
   * Optional provider metadata associated with the tool call.
   */
  providerMetadata?: Record<string, JSONObject>;
};

/**
 * Approval request for a tool call executed by the harness.
 */
export type HarnessV2ToolApprovalRequest = {
  /**
   * Requests approval before a tool executed by the harness continues.
   */
  type: 'tool-approval-request';

  /**
   * Identifier referenced by the matching approval response.
   */
  approvalId: string;

  /**
   * Identifier of the tool call awaiting approval.
   */
  toolCallId: string;

  /**
   * Optional provider metadata associated with the approval request.
   */
  providerMetadata?: Record<string, JSONObject>;
};

/**
 * Result of a tool call executed by the harness.
 */
export type HarnessV2ToolResult = {
  /**
   * Reports the result of a tool call executed by the harness.
   */
  type: 'tool-result';

  /**
   * Identifier of the tool call this result belongs to.
   */
  toolCallId: string;

  /**
   * Name of the tool that produced the result.
   */
  toolName: string;

  /**
   * JSON result of the tool call, or the error message for an error result.
   */
  result: JSONValue;

  /**
   * Whether the result is an error.
   */
  isError?: boolean;

  /**
   * Whether the result is preliminary and replaced by a later result.
   */
  preliminary?: boolean;

  /**
   * Whether the tool is defined at runtime, e.g. an MCP tool.
   */
  dynamic?: boolean;

  /**
   * Optional provider metadata associated with the tool result.
   */
  providerMetadata?: Record<string, JSONObject>;
};

/**
 * Warning emitted when a harness cannot honor a requested setting or tool.
 */
export type HarnessV2CallWarning =
  | {
      /**
       * The harness does not support a supplied setting.
       */
      type: 'unsupported-setting';

      /**
       * Name of the unsupported setting.
       */
      setting: string;

      /**
       * Optional explanation of the limitation.
       */
      details?: string;
    }
  | {
      /**
       * The harness does not support a supplied tool.
       */
      type: 'unsupported-tool';

      /**
       * Name of the unsupported tool.
       */
      tool: string;

      /**
       * Optional explanation of the limitation.
       */
      details?: string;
    }
  | {
      /**
       * A warning that does not fit another structured category.
       */
      type: 'other';

      /**
       * Human-readable warning message.
       */
      message: string;
    };

/**
 * Stream events a harness may emit while processing a session.
 *
 * Step and turn ends are not stream events a harness emits: they are signaled
 * only through the drive context's `finishStep()` and `finishTurn()`, which
 * produce the corresponding parts for consumers.
 */
export type HarnessV2StreamPart =
  | {
      /**
       * Begins a model or harness stream and may report call-level warnings.
       */
      type: 'stream-start';

      /**
       * Unsupported settings or tools encountered for this call.
       */
      warnings?: ReadonlyArray<HarnessV2CallWarning>;

      /**
       * Provider model identifier when the harness can report it.
       */
      modelId?: string;
    }
  | {
      /**
       * Begins a text segment whose deltas share the same ID.
       */
      type: 'text-start';

      /**
       * Identifier pairing this start with its deltas and end event.
       */
      id: string;

      /**
       * Optional provider metadata associated with this segment.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Emits an incremental text segment.
       */
      type: 'text-delta';

      /**
       * Identifier of the text segment being extended.
       */
      id: string;

      /**
       * Newly generated text, not the complete accumulated segment.
       */
      delta: string;

      /**
       * Optional provider metadata associated with this delta.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Ends the text segment identified by `id`.
       */
      type: 'text-end';

      /**
       * Identifier of the text segment being closed.
       */
      id: string;

      /**
       * Optional provider metadata associated with the end event.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Begins a reasoning segment whose deltas share the same ID.
       */
      type: 'reasoning-start';

      /**
       * Identifier pairing this start with its deltas and end event.
       */
      id: string;

      /**
       * Optional provider metadata associated with this segment.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Emits an incremental reasoning segment.
       */
      type: 'reasoning-delta';

      /**
       * Identifier of the reasoning segment being extended.
       */
      id: string;

      /**
       * Newly emitted reasoning text.
       */
      delta: string;

      /**
       * Optional provider metadata associated with this delta.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Ends the reasoning segment identified by `id`.
       */
      type: 'reasoning-end';

      /**
       * Identifier of the reasoning segment being closed.
       */
      id: string;

      /**
       * Optional provider metadata associated with the end event.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | HarnessV2ToolInputStart
  | HarnessV2ToolInputDelta
  | HarnessV2ToolInputEnd
  | (HarnessV2ToolCall & {
      /**
       * Adapter-native tool name when it differs from the exposed tool name.
       */
      nativeName?: string;
    })
  | HarnessV2ToolApprovalRequest
  | HarnessV2ToolResult
  | {
      /**
       * Reports a filesystem change made during the harness session.
       */
      type: 'file-change';

      /**
       * Kind of operation performed on the path.
       */
      event: 'create' | 'modify' | 'delete';

      /**
       * Path affected by the operation.
       */
      path: string;

      /**
       * Optional provider metadata associated with the change.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Reports that prior context was compacted.
       */
      type: 'compaction';

      /**
       * Whether compaction was explicitly requested or automatic.
       */
      trigger: 'manual' | 'auto';

      /**
       * Summary replacing the compacted context.
       */
      summary: string;

      /**
       * Token count before compaction, when available.
       */
      tokensBefore?: number;

      /**
       * Token count after compaction, when available.
       */
      tokensAfter?: number;

      /**
       * Optional provider metadata associated with compaction.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Reports an error surfaced by the harness.
       */
      type: 'error';

      /**
       * Serializable error data, normalized by the adapter from whatever its
       * runtime threw.
       */
      error: HarnessV2EffectError;
    }
  | {
      /**
       * Carries an adapter-specific value without interpreting it.
       */
      type: 'raw';

      /**
       * Adapter-specific payload, passed through unmodified if serializable
       * and converted otherwise.
       */
      rawValue: SerializableValue;
    }
  | {
      /**
       * Marks that the current model step's streamed content should reset.
       */
      type: 'reset-step';
    };
