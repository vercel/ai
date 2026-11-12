import type {
  HarnessV2Effect,
  HarnessV2EffectContext,
  HarnessV2EffectError,
  HarnessV2EffectOutput,
} from '../../../v2/harness-v2-effect';
import type {
  HarnessV2ToolExecutionOutput,
  HarnessV2ToolGateOutput,
} from '../../../v2/harness-v2-drive-context';
import type { HarnessV2LogEvent } from '../../../v2/harness-v2-log';
import type {
  HarnessV2CallWarning,
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2ToolApprovalRequest,
  HarnessV2ToolCall,
  HarnessV2ToolInputDelta,
  HarnessV2ToolInputEnd,
  HarnessV2ToolInputStart,
  HarnessV2ToolResult,
  HarnessV2Usage,
} from '../../../v2/harness-v2-stream-part';
import type { JSONValue, SerializableValue } from '@ai-sdk/provider';

/**
 * Options of one `effect()` call. Same as `HarnessV2EffectOptions`, redeclared
 * so the engine does not depend on the adapter-facing type.
 */
export type HarnessAgentEffectOptions<
  T extends SerializableValue = SerializableValue,
> = Pick<HarnessV2Effect, 'key' | 'name' | 'replay' | 'input'> &
  Partial<Pick<HarnessV2Effect, 'deliveredSubmissionIds'>> & {
    /**
     * Work to run for a new attempt: an async function whose return value is
     * the output, or an async generator whose yielded values are recorded as
     * partial results and whose last yielded value is the output.
     */
    fn: (context: HarnessV2EffectContext) => PromiseLike<T> | AsyncIterable<T>;
  };

/**
 * Runs a keyed effect and returns its committed output. Terminal outputs are
 * replayed; recorded retryable interruptions permit a new attempt. Callback
 * failures become error outputs, while persistence failures reject the call.
 */
export type HarnessAgentEffectFunction = <
  T extends SerializableValue = SerializableValue,
>(
  options: HarnessAgentEffectOptions<T>,
) => Promise<HarnessV2EffectOutput<T>>;

/**
 * Executes one of the app's own tools as a recorded effect. Same as
 * `HarnessV2DriveContext['executeHostTool']`, redeclared so the engine does not
 * depend on the adapter-facing type.
 *
 * Each call is recorded as the effect `tool:${toolCallId}` under the tool's
 * replay policy, so a recorded call returns its recorded outcome without
 * running the tool again. Tool values are converted to JSON, and the
 * `tool-result` parts are emitted by the engine. A client tool (no `execute`)
 * resolves `suspended` without being recorded.
 */
export type HarnessAgentExecuteHostToolFunction = <
  T extends JSONValue = JSONValue,
>(call: {
  /**
   * ID of the tool call, unique across all tool calls.
   */
  toolCallId: string;

  /**
   * Name of the tool to execute.
   */
  toolName: string;

  /**
   * Tool input, already parsed from the model's JSON.
   */
  input: JSONValue;
}) => Promise<HarnessV2ToolExecutionOutput<T>>;

/**
 * Gates one of the harness's built-in tools before the runtime runs it. Same
 * as `HarnessV2DriveContext['gateBuiltinTool']`, redeclared so the engine does
 * not depend on the adapter-facing type.
 *
 * Each call is recorded as the effect `tool:${toolCallId}` under the built-in
 * tool's replay policy. A new call is approved once its start is committed and
 * stays open until the adapter reports its outcome. A call with a recorded
 * output is denied; a recorded retryable interruption is approved again as a
 * new attempt, like any effect. The `tool-result` parts are emitted by the
 * engine.
 */
export type HarnessAgentGateBuiltinToolFunction = (call: {
  /**
   * ID of the tool call, unique across all tool calls.
   */
  toolCallId: string;

  /**
   * Name of the built-in tool to run.
   */
  toolName: string;

  /**
   * Tool input, already parsed from the model's JSON.
   */
  input: JSONValue;
}) => Promise<HarnessV2ToolGateOutput>;

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
    }
  | {
      /**
       * Records a finished AI SDK step, visible only to the agent engine.
       * Written by the drive context's `finishStep()` under the ID
       * `finish-step:${submissionId}:${stepNumber}`.
       */
      readonly type: 'finish-step';

      /**
       * Step identity and the options the step was finished with.
       */
      readonly data: {
        /**
         * ID of the `prompt` submission that started the step's turn.
         */
        readonly submissionId: string;

        /**
         * Zero-based number of the step within its turn.
         */
        readonly stepNumber: number;

        /**
         * Reason reported for the step's completion.
         */
        readonly finishReason: HarnessV2FinishReason;

        /**
         * Usage attributed to the step.
         */
        readonly usage: HarnessV2Usage;

        /**
         * Provider metadata associated with the step, if any.
         */
        readonly harnessMetadata?: HarnessV2Metadata;
      };

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    }
  | {
      /**
       * Records the start of a turn, visible only to the agent engine. Written
       * by the effect function under the ID `turn-start:${submissionId}`, right
       * before the `effect-start` that first delivers the turn's `prompt`
       * submission. From then on, that submission counts as delivered and the
       * turn is the session's current turn.
       */
      readonly type: 'turn-start';

      /**
       * Turn identity.
       */
      readonly data: {
        /**
         * ID of the `prompt` submission that starts the turn.
         */
        readonly submissionId: string;
      };

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    }
  | {
      /**
       * Records a finished turn, visible only to the agent engine. Written by
       * the drive context's `finishTurn()` under the ID
       * `finish-turn:${submissionId}`.
       */
      readonly type: 'finish-turn';

      /**
       * Turn identity and the options the turn was finished with.
       */
      readonly data: {
        /**
         * ID of the `prompt` submission that started the turn.
         */
        readonly submissionId: string;

        /**
         * Reason reported for the turn's completion.
         */
        readonly finishReason: HarnessV2FinishReason;

        /**
         * Aggregate usage across all steps in the turn.
         */
        readonly totalUsage: HarnessV2Usage;

        /**
         * Provider metadata associated with the turn, if any.
         */
        readonly harnessMetadata?: HarnessV2Metadata;
      };

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    };

/**
 * Finishes the current AI SDK step. Same as `HarnessV2DriveContext['finishStep']`,
 * redeclared so the engine does not depend on the adapter-facing type.
 *
 * The current turn is the one started by the latest `turn-start` event,
 * finished or not. A `stepNumber` below the turn's recorded step
 * count is a replay and records and emits nothing; one equal to it records the
 * step and emits `finish-step`; anything else rejects.
 */
export type HarnessAgentFinishStepFunction = (options: {
  /**
   * Zero-based number of the step within the current turn.
   */
  stepNumber: number;

  /**
   * Reason reported for the step's completion.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Usage attributed to this step.
   */
  usage: HarnessV2Usage;

  /**
   * Optional provider metadata associated with this step.
   */
  harnessMetadata?: HarnessV2Metadata;
}) => Promise<void>;

/**
 * Finishes the current turn. Same as `HarnessV2DriveContext['finishTurn']`,
 * redeclared so the engine does not depend on the adapter-facing type.
 *
 * The current turn is the one started by the latest `turn-start` event. If it
 * is already finished, the call is a replay and records and
 * emits nothing; otherwise it records the finish and emits `finish`.
 */
export type HarnessAgentFinishTurnFunction = (options: {
  /**
   * Reason reported for the turn's completion.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Aggregate usage across all steps in the turn.
   */
  totalUsage: HarnessV2Usage;

  /**
   * Optional provider metadata associated with the turn.
   */
  harnessMetadata?: HarnessV2Metadata;
}) => Promise<void>;

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
  read(options?: {
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
   * The callback is called synchronously as soon as a read or write adds the
   * event to the log's in-memory copy, before that read or write resolves.
   * Previously cached events are not replayed; events first observed after
   * registration may also appear in a subsequent read's history.
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
 * `HarnessV2StreamPart`. The `start`, `finish-step`, `finish`, `withdraw` and
 * `yield` variants are produced only by the engine: `start` when a turn
 * starts, the finish parts from the drive context's `finishStep()` and
 * `finishTurn()`, `withdraw` from the stream writer's `withdraw()`, and
 * `yield` when a drive yields at its deadline. A harness never emits them.
 *
 * This union is redeclared rather than derived from `HarnessV2StreamPart`, so
 * every change to that type must be mirrored here.
 */
export type HarnessAgentStreamPart =
  | {
      /**
       * Marks the start of a turn. Emitted by the engine only, keyed
       * `turn-start:${submissionId}`.
       */
      type: 'start';
    }
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
       * Completes one model step.
       */
      type: 'finish-step';

      /**
       * Reason reported for the step's completion.
       */
      finishReason: HarnessV2FinishReason;

      /**
       * Usage attributed to this step.
       */
      usage: HarnessV2Usage;

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
      finishReason: HarnessV2FinishReason;

      /**
       * Aggregate usage across all steps in the call.
       */
      totalUsage: HarnessV2Usage;

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
    }
  | {
      /**
       * Instructs readers to withdraw the output of interrupted effect
       * attempts. Emitted by the engine only.
       */
      type: 'withdraw';

      /**
       * Start IDs of the attempts whose output readers withdraw.
       */
      startIds: string[];
    }
  | {
      /**
       * Marks that the drive yielded at its deadline. The current turn, if
       * unfinished, continues in a later drive. Emitted by the engine only.
       */
      type: 'yield';
    };

/**
 * One record of a session's stream: a part, plus the engine-only tags readers
 * use to attribute and deduplicate it.
 */
export type HarnessAgentStreamPartRecord = {
  /**
   * Stream part to translate for consumers.
   */
  part: HarnessAgentStreamPart;

  /**
   * Effect attempt that emitted the part, if any.
   */
  startId?: string;

  /**
   * Log key deduplicating a step or turn finish part, if any.
   */
  key?: string;
};

/**
 * Ordered, best-effort writer for one session's stream, owned by one drive.
 *
 * Emitting never blocks: records are encoded synchronously, then written in
 * strict order, with exactly one World write in flight at a time. Records
 * emitted during the same synchronous burst, or while a write is in flight,
 * share the next chunk. Failed writes are ignored, since the stream carries
 * output, never session state. Once the drive's abort signal fires, records not
 * yet sent are discarded and new records are dropped.
 */
export type HarnessAgentStreamWriter = {
  /**
   * Emits a part tagged with the effect attempt that produced it and/or the
   * log key of a step or turn finish. `startId` lets readers withdraw the part
   * if its attempt was interrupted; `key` lets readers drop duplicate finishes.
   * Throws synchronously if the part is not serializable.
   */
  emit(
    options: {
      /**
       * Stream part to write.
       */
      part: HarnessAgentStreamPart;
    } & (
      | {
          /**
           * Effect attempt that produced the part.
           */
          startId: string;

          /**
           * Log key of a step or turn finish part.
           */
          key?: string;
        }
      | {
          /**
           * Effect attempt that produced the part.
           */
          startId?: string;

          /**
           * Log key of a step or turn finish part.
           */
          key: string;
        }
    ),
  ): void;

  /**
   * Emits an untagged part, as produced by the drive context's `unsafeEmit()`.
   * Readers can never withdraw it. Throws synchronously if the part is not
   * serializable.
   */
  unsafeEmit(part: HarnessAgentStreamPart): void;

  /**
   * Emits the engine-only `withdraw` part withdrawing the output of the given
   * effect attempts.
   */
  withdraw(options: {
    /**
     * Start IDs of the attempts whose output readers withdraw.
     */
    startIds: readonly string[];
  }): void;

  /**
   * Resolves once every record emitted so far has been written or failed.
   */
  flush(): Promise<void>;

  /**
   * Stops accepting records, flushes, then closes the World stream (best
   * effort). Only call it when the session ends, never at the end of a drive,
   * since the stream spans every drive of the session. Calling it again has
   * no effect.
   */
  close(): Promise<void>;
};
