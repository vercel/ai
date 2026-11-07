import type {
  HarnessV2Effect,
  HarnessV2EffectContext,
  HarnessV2EffectError,
  HarnessV2EffectOutput,
} from '../../../v2/harness-v2-effect';
import type { HarnessV2LogEvent } from '../../../v2/harness-v2-log';
import type {
  HarnessV2CallWarning,
  HarnessV2Metadata,
} from '../../../v2/harness-v2-stream-part';
import type {
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolApprovalRequest,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  LanguageModelV4Usage,
  SerializableValue,
} from '@ai-sdk/provider';

/**
 * Runs a keyed effect and returns its committed output. Terminal outputs are
 * replayed; recorded retryable interruptions permit a new attempt. Callback
 * failures become error outputs, while persistence failures reject the call.
 */
export type HarnessAgentEffectFunction = <
  T extends SerializableValue = SerializableValue,
>(
  key: string,
  options: Pick<HarnessV2Effect, 'name' | 'replay' | 'input'> &
    Partial<Pick<HarnessV2Effect, 'deliveredSubmissionIds'>>,
  fn: (context: HarnessV2EffectContext) => PromiseLike<T> | AsyncIterable<T>,
) => Promise<HarnessV2EffectOutput<T>>;

/**
 * Event variants stored in the agent log, including events that are private to
 * the HarnessAgent engine. Public event shapes are reused with required IDs
 * for every stored event, including adapter-defined events.
 *
 * Additional union variants beyond HarnessV2LogEvent support framework-internal
 * behavior, such as tracking partial effect output. These events are not exposed
 * to harness adapters and therefore do not belong in HarnessV2LogEvent.
 *
 * Runtime checks for common fields and supported event types live in
 * is-valid-harness-agent-log-event.ts. Changes to these fields or event types
 * must also update that helper and its tests. Variant-specific data payloads
 * are not validated by the helper.
 */
export type HarnessAgentLogEvent =
  | (HarnessV2LogEvent & {
      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    })
  | {
      /**
       * Records a complete yielded value, visible only to the agent engine.
       */
      readonly type: 'effect-progress';

      /**
       * Effect attempt and its latest yielded value.
       */
      readonly data: {
        /**
         * ID of the corresponding `effect-start` event.
         */
        readonly startId: string;

        /**
         * Complete yielded value used as partial output on interruption.
         */
        readonly partial: SerializableValue;
      };

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    };

/**
 * Event type filters for an agent-log append listener.
 */
export type HarnessAgentLogListenerConfig = {
  /**
   * Event types the listener is allowed to receive.
   */
  types?: HarnessAgentLogEvent['type'][];

  /**
   * Event types the listener must not receive.
   */
  ignoreTypes?: HarnessAgentLogEvent['type'][];
};

/**
 * Append-only log used by the HarnessAgent engine. The harness adapter
 * receives a wrapped version of this (`HarnessV2Log`) with limited access.
 */
export type HarnessAgentLog = {
  /**
   * Refreshes the committed log and returns canonical events after a World
   * position, optionally filtered by type. Infrastructure and duplicate records
   * advance the position without appearing in the returned events.
   */
  read(opts?: {
    /**
     * Position after which to return events, independent of type filters.
     */
    after?: number;

    /**
     * Event types to include in the returned events.
     */
    types?: HarnessAgentLogEvent['type'][];
  }): Promise<{
    /**
     * Canonical events matching the requested position and event types.
     */
    events: HarnessAgentLogEvent[];
    /**
     * Last verified committed World slot, including non-harness records.
     */
    position: number;
  }>;

  /**
   * Appends an event and waits for its canonical durable outcome. Returns false
   * if an identical event is found before writing. Returns true when a matching
   * event is confirmed after attempting a write, including when a concurrent
   * append committed it. Conflicting content under the same ID is rejected.
   * Exhausted uncertain-outcome recovery refuses further appends on this
   * instance; reads and reconstruction through a new log remain available.
   */
  append(event: HarnessAgentLogEvent): Promise<boolean>;

  /**
   * Registers a callback for matching new events and returns an unsubscribe
   * function. Each matching canonical event first observed while registered is
   * delivered once, in committed order, with an independent payload snapshot.
   * Delivery is synchronous when a read or write folds the event, before that
   * operation resolves. Previously cached events are not replayed; events first
   * observed after registration may also appear in a subsequent read's history.
   * Callback failures are isolated from persistence and other listeners, and
   * asynchronous callback work is not awaited. External writes are discovered
   * through advisory hints, polling, reads, or append reconciliation.
   */
  onAppend(options: {
    /**
     * Callback invoked when an event matches the listener configuration.
     */
    listener: (event: HarnessAgentLogEvent) => void;

    /**
     * Optional allowlist and denylist for event types.
     */
    config?: HarnessAgentLogListenerConfig;
  }): () => void;
};

/**
 * Stream events handled by the HarnessAgent engine: the engine-side superset of
 * `HarnessV2StreamPart`. The `finish-step` and `finish` variants are produced
 * only by the engine, from the drive context's `finishStep()` and
 * `finishTurn()`; a harness never emits them.
 *
 * This union is redeclared rather than derived from `HarnessV2StreamPart`, so
 * every change to that type must be mirrored here.
 */
export type HarnessAgentStreamPart =
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
