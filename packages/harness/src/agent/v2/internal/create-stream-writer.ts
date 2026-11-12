import type { JSONValue, SerializableValue } from '@ai-sdk/provider';
import {
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
  parseJSON,
} from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';
import type { HarnessV2EffectError } from '../../../v2/harness-v2-effect';
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
       * `turn-start:${turnId}`.
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

const STREAM_RECORD_VERSION = 1;

/**
 * Encodes one stream record as a JSON text line followed by a newline. The part is
 * encoded immediately, so later mutations by the caller cannot change what
 * is written; encoding errors propagate to the caller.
 */
function encodeRecord(options: {
  /**
   * Record to encode.
   */
  record: HarnessAgentStreamPartRecord;
}): string {
  const { record } = options;
  const encoded: {
    version: number;
    part: JSONValue;
    startId?: string;
    key?: string;
  } = {
    version: STREAM_RECORD_VERSION,
    part: jsonEncodeSerializableValue({
      value: record.part as SerializableValue,
    }),
  };
  if (record.startId != null) encoded.startId = record.startId;
  if (record.key != null) encoded.key = record.key;
  return JSON.stringify(encoded) + '\n';
}

/**
 * Creates the writer for a session's stream, owned by one drive.
 *
 * Records are written to one World stream per session, in strict order: a chunk
 * is sent only after the previous write settled. The first record of an idle
 * burst schedules a send on the next microtask, so records emitted in the same
 * synchronous burst share a chunk, and records emitted while a write is in
 * flight form the next chunk. Every chunk ends with a blank line, giving
 * readers a chunk boundary they can count when resuming.
 *
 * Write failures are ignored, because the stream carries output rather than
 * session state. When the drive's abort signal fires, records not yet sent are
 * discarded and new records are dropped; a write already in flight cannot be
 * recalled.
 */
export function createStreamWriter(options: {
  /**
   * World that stores the session's stream.
   */
  world: World;
  /**
   * Session whose run and stream the writer writes to.
   */
  session: HarnessAgentSession;
  /**
   * Abort signal of the drive that owns this writer.
   */
  abortSignal: AbortSignal;
}): HarnessAgentStreamWriter {
  const { world, session, abortSignal } = options;
  const { runId } = session;
  const name = session.getStreamName();
  let buffer = '';
  let sending: Promise<void> | undefined;
  let closing: Promise<void> | undefined;

  const discardUnsent = () => {
    buffer = '';
  };
  abortSignal.addEventListener('abort', discardUnsent, { once: true });

  /**
   * Sends buffered records one chunk at a time until the buffer is empty. Only
   * one invocation runs at a time, which keeps exactly one write in flight.
   */
  async function send(): Promise<void> {
    try {
      await Promise.resolve();
      while (buffer.length > 0) {
        const chunk = buffer + '\n';
        buffer = '';
        await Promise.resolve()
          .then(() => world.streams.write(runId, name, chunk))
          .catch(() => {});
      }
    } finally {
      sending = undefined;
    }
  }

  /**
   * Buffers an encoded record, unless the writer was closed or the drive
   * aborted, and starts sending if no send is running.
   */
  function push(record: HarnessAgentStreamPartRecord): void {
    if (closing != null || abortSignal.aborted) return;
    buffer += encodeRecord({ record });
    sending ??= send();
  }

  /**
   * Waits until no record is buffered and no write is in flight.
   */
  async function flush(): Promise<void> {
    for (let current = sending; current != null; current = sending) {
      await current;
    }
  }

  return {
    emit({ part, startId, key }) {
      const record: HarnessAgentStreamPartRecord = { part };
      if (startId != null) record.startId = startId;
      if (key != null) record.key = key;
      push(record);
    },

    unsafeEmit(part) {
      push({ part });
    },

    withdraw({ startIds }) {
      push({ part: { type: 'withdraw', startIds: [...startIds] } });
    },

    flush,

    close() {
      closing ??= (async () => {
        try {
          await flush();
          await Promise.resolve()
            .then(() => world.streams.close(runId, name))
            .catch(() => {});
        } finally {
          abortSignal.removeEventListener('abort', discardUnsent);
        }
      })();
      return closing;
    },
  };
}

/**
 * Decodes stream text into records, one per line, skipping the blank lines that mark chunk
 * boundaries. Accepts text concatenated from several chunks. Throws on a
 * malformed record or an unsupported version, since skipping a record would make
 * readers misattribute or lose output.
 */
export async function decodeStreamRecords(options: {
  /**
   * Stream text, possibly spanning several chunks.
   */
  text: string;
}): Promise<HarnessAgentStreamPartRecord[]> {
  const records: HarnessAgentStreamPartRecord[] = [];
  for (const text of options.text.split('\n')) {
    if (text === '') continue;
    const parsed = await parseJSON({ text });
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('HarnessAgentStream: invalid or unsupported record.');
    }
    const envelope = parsed as Record<string, JSONValue>;
    if (envelope.version !== STREAM_RECORD_VERSION) {
      throw new Error('HarnessAgentStream: invalid or unsupported record.');
    }
    const { startId, key } = envelope;
    if (
      !Object.hasOwn(envelope, 'part') ||
      (startId !== undefined && typeof startId !== 'string') ||
      (key !== undefined && typeof key !== 'string')
    ) {
      throw new Error('HarnessAgentStream: invalid part record.');
    }
    const part = jsonDecodeSerializableValue({ value: envelope.part });
    if (
      part == null ||
      typeof part !== 'object' ||
      typeof (part as { type?: unknown }).type !== 'string'
    ) {
      throw new Error('HarnessAgentStream: invalid stream part.');
    }
    const record: HarnessAgentStreamPartRecord = {
      part: part as HarnessAgentStreamPart,
    };
    if (startId !== undefined) record.startId = startId as string;
    if (key !== undefined) record.key = key as string;
    records.push(record);
  }
  return records;
}
