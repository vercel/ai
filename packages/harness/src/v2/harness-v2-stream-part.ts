import type {
  JSONValue,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolApprovalRequest,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

/**
 * Provider-scoped metadata emitted with harness stream events.
 */
export type HarnessV2Metadata = Record<string, Record<string, JSONValue>>;

/**
 * Warning emitted when a harness cannot honor a requested setting or tool.
 */
type HarnessV2CallWarning =
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
  | Extract<
      LanguageModelV4StreamPart,
      {
        /**
         * Begins streaming a tool call's input.
         */
        type: 'tool-input-start';
      }
    >
  | Extract<
      LanguageModelV4StreamPart,
      {
        /**
         * Emits a delta of the tool call's input.
         */
        type: 'tool-input-delta';
      }
    >
  | Extract<
      LanguageModelV4StreamPart,
      {
        /**
         * Marks the end of a tool call's input stream.
         */
        type: 'tool-input-end';
      }
    >
  | (LanguageModelV4ToolCall & {
      /**
       * Adapter-native tool name when it differs from the exposed tool name.
       */
      nativeName?: string;
    })
  | LanguageModelV4ToolApprovalRequest
  | LanguageModelV4ToolResult
  | {
      /**
       * Completes one model step.
       */
      type: 'finish-step';

      /**
       * Reason reported for the step's completion.
       */
      finishReason: LanguageModelV4FinishReason;

      /**
       * Usage attributed to this step.
       */
      usage: LanguageModelV4Usage;

      /**
       * Optional provider metadata associated with this step.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      /**
       * Completes the overall model call.
       */
      type: 'finish';

      /**
       * Reason reported for the call's completion.
       */
      finishReason: LanguageModelV4FinishReason;

      /**
       * Aggregate usage across all steps in the call.
       */
      totalUsage: LanguageModelV4Usage;

      /**
       * Optional provider metadata associated with the call.
       */
      harnessMetadata?: HarnessV2Metadata;
    }
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
       * Original error value, which may not be serializable.
       */
      error: unknown;
    }
  | {
      /**
       * Carries an adapter-specific value without interpreting it.
       */
      type: 'raw';

      /**
       * Unmodified adapter-specific payload.
       */
      rawValue: unknown;
    }
  | {
      /**
       * Marks that the current model step's streamed content should reset.
       */
      type: 'reset-step';
    };
