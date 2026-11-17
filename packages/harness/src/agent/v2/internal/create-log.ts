import {
  cloneSerializableValue,
  DelayedPromise,
  generateId,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
  parseJSON,
} from '@ai-sdk/provider-utils';
import {
  requireEventSlot,
  type Event,
  type EventResult,
  type World,
} from '@workflow/world';
import type { JSONValue, SerializableValue } from '@ai-sdk/provider';
import { decodeJSONRecordValue, encodeJSONRecord } from './encode-json-record';
import { isValidHarnessAgentLogEvent } from './is-valid-harness-agent-log-event';
import type { HarnessAgentDriveIdentity } from './start-drive';
import type { HarnessV2EffectOutput } from '../../../v2/harness-v2-effect';
import type {
  HarnessV2LogAdapterEvent,
  HarnessV2LogEffectEndEvent,
  HarnessV2LogEffectStartEvent,
  HarnessV2LogFinishTurnEvent,
  HarnessV2LogSubmissionEvent,
  HarnessV2LogTurn,
} from '../../../v2/harness-v2-log';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2Usage,
} from '../../../v2/harness-v2-stream-part';

/**
 * Records a user prompt or steering message submitted to the session.
 */
export type HarnessAgentLogSubmissionEvent = HarnessV2LogSubmissionEvent;

/**
 * Records the start of an effect attempt.
 */
export type HarnessAgentLogEffectStartEvent = HarnessV2LogEffectStartEvent;

/**
 * Records the completion or interruption of an effect attempt.
 */
export type HarnessAgentLogEffectEndEvent = HarnessV2LogEffectEndEvent;

/**
 * Records a finished turn.
 */
export type HarnessAgentLogFinishTurnEvent = HarnessV2LogFinishTurnEvent;

/**
 * Records an adapter-defined event. Unlike in the adapter-facing log, its ID
 * is required, since every stored event has one.
 */
export type HarnessAgentLogAdapterEvent = HarnessV2LogAdapterEvent & {
  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records a complete yielded value of an effect attempt, visible only to the
 * agent engine.
 */
export type HarnessAgentLogEffectProgressEvent = {
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
 * Records a finished AI SDK step, visible only to the agent engine.
 */
export type HarnessAgentLogFinishStepEvent = {
  /**
   * Records a finished AI SDK step, visible only to the agent engine.
   * Written by the drive context's `finishStep()` under the ID
   * `finish-step:${turnId}:${stepNumber}`.
   */
  readonly type: 'finish-step';

  /**
   * Step identity and the options the step was finished with.
   */
  readonly data: {
    /**
     * ID of the step's turn. Currently the ID of the `prompt` submission
     * that started the turn.
     */
    readonly turnId: string;

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
};

/**
 * Records the start of a turn, visible only to the agent engine.
 */
export type HarnessAgentLogTurnStartEvent = {
  /**
   * Records the start of a turn, visible only to the agent engine. Written
   * by the effect function under the ID `turn-start:${turnId}`, right
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
     * ID of the turn. Currently the ID of the `prompt` submission that
     * starts the turn.
     */
    readonly turnId: string;
  };

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records the start of a drive, visible only to the agent engine.
 */
export type HarnessAgentLogDriveStartEvent = {
  /**
   * Records the start of a drive, visible only to the agent engine.
   * Written under the ID `drive-start:${driveId}` before the drive
   * changes anything else in the session. Recovery uses the latest one
   * to decide whether the drive that left attempts unfinished is gone.
   */
  readonly type: 'drive-start';

  /**
   * Identity of the drive.
   */
  readonly data: HarnessAgentDriveIdentity;

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Asks the drive running the session's current turn to crash its process,
 * visible only to the agent engine.
 */
export type HarnessAgentLogCrashRequestEvent = {
  /**
   * Asks the drive running the session's current turn to crash its
   * process, visible only to the agent engine. Written by
   * `experimental_crash()`. It applies to the latest `drive-start`
   * before it.
   */
  readonly type: 'crash-request';

  /**
   * How the drive crashes.
   */
  readonly data: {
    /**
     * Whether the drive records a `drive-crash` before it crashes. If
     * not set, the drive crashes like a real crash would, without any
     * record.
     */
    readonly recordCrash?: boolean;
  };

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records that a drive is about to crash its process on request, visible
 * only to the agent engine.
 */
export type HarnessAgentLogDriveCrashEvent = {
  /**
   * Records that a drive is about to crash its process on request,
   * visible only to the agent engine. Written under the ID
   * `drive-crash:${driveId}` right before the process is killed, only
   * if the request asked for it (`recordCrash`). It proves to recovery
   * at once that the drive is gone. Its absence proves nothing: a drive
   * may have crashed without it, which recovery then has to prove from
   * the drive's `drive-start`.
   */
  readonly type: 'drive-crash';

  /**
   * Crashing drive and the request it follows.
   */
  readonly data: {
    /**
     * Identifier of the crashing drive.
     */
    readonly driveId: string;

    /**
     * ID of the `crash-request` event the drive follows.
     */
    readonly requestId: string;
  };

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records that a tool call attempt is about to run its tool, visible only to
 * the agent engine.
 */
export type HarnessAgentLogToolExecutionStartEvent = {
  /**
   * Records that a tool call attempt is about to run its tool, visible
   * only to the agent engine. Written under the ID
   * `tool-execution-start:${startId}` and committed right before the tool
   * runs. An abandoned tool attempt without it provably never ran its
   * tool, so recovery may retry it regardless of its replay policy.
   */
  readonly type: 'tool-execution-start';

  /**
   * Effect attempt of the tool call.
   */
  readonly data: {
    /**
     * ID of the corresponding `effect-start` event.
     */
    readonly startId: string;
  };

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Event variants stored in the agent log, including events that are private to
 * the HarnessAgent engine. Public event shapes are reused with required IDs
 * for every stored event, including adapter-defined events.
 *
 * Additional union variants beyond HarnessV2LogEvent support framework-internal
 * behavior, such as tracking partial effect output. These events are not exposed
 * to harness adapters and therefore do not belong in HarnessV2LogEvent.
 *
 * The `turnId` of `turn-start`, `finish-step` and `finish-turn` events is
 * currently the ID of the `prompt` submission that started the turn, and the
 * engine relies on that (e.g. to find prompts that have not started a turn).
 * Adapters only see `turnId` on `finish-turn` events, as an opaque string,
 * so this relationship can change without affecting them.
 *
 * Runtime checks for common fields and supported event types live in
 * is-valid-harness-agent-log-event.ts. Changes to these fields or event types
 * must also update that helper and its tests. Variant-specific data payloads
 * are not validated by the helper.
 */
export type HarnessAgentLogEvent =
  | HarnessAgentLogSubmissionEvent
  | HarnessAgentLogEffectStartEvent
  | HarnessAgentLogEffectEndEvent
  | HarnessAgentLogFinishTurnEvent
  | HarnessAgentLogAdapterEvent
  | HarnessAgentLogEffectProgressEvent
  | HarnessAgentLogFinishStepEvent
  | HarnessAgentLogTurnStartEvent
  | HarnessAgentLogDriveStartEvent
  | HarnessAgentLogCrashRequestEvent
  | HarnessAgentLogDriveCrashEvent
  | HarnessAgentLogToolExecutionStartEvent;

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
 * An accepted effect attempt: its `effect-start` event and the log events
 * referring to it.
 *
 * An `effect-start` is accepted only if it is the next attempt of its effect
 * key and the previous attempt, if any, ended with a retryable interruption.
 * Progress and end events only apply to an accepted attempt that is still the
 * latest of its key and has not ended; every other one has no effect.
 */
export type HarnessAgentLogEffectAttempt = {
  /**
   * Start of the attempt.
   */
  readonly start: HarnessAgentLogEffectStartEvent;

  /**
   * Latest committed progress of the attempt, if any.
   */
  readonly progress?: HarnessAgentLogEffectProgressEvent;

  /**
   * First committed end of the attempt, if it ended.
   */
  readonly end?: HarnessAgentLogEffectEndEvent;
};

/**
 * A turn as the adapter sees it, plus the log events only the engine sees.
 */
export type HarnessAgentLogTurn = HarnessV2LogTurn & {
  /**
   * Start of the turn.
   */
  readonly start: HarnessAgentLogTurnStartEvent;

  /**
   * Finished steps of the turn, in step order.
   */
  readonly steps: readonly HarnessAgentLogFinishStepEvent[];
};

/**
 * A drive: its `drive-start` event and the log events referring to its
 * `driveId`.
 */
export type HarnessAgentLogDrive = {
  /**
   * Start of the drive.
   */
  readonly start: HarnessAgentLogDriveStartEvent;

  /**
   * Recorded crash of the drive, if any.
   */
  readonly crash?: HarnessAgentLogDriveCrashEvent;
};

/**
 * Append-only log used by the HarnessAgent engine. The harness adapter
 * receives a narrower version of this (`HarnessV2Log`).
 *
 * The log in the World is the source of truth. A log instance keeps the
 * events it has read or written in memory, in log order, and its lookups
 * answer synchronously from them, applying one set of rules to all events.
 * New events from other processes only arrive through `refresh()`, through an
 * `append()`, or while a listener is registered (on hints and periodically).
 * Lookups return the log's own objects, which callers must not modify.
 */
export type HarnessAgentLog = {
  /**
   * Appends an event and waits for its canonical durable outcome. Returns false
   * if an identical event is found before writing. Returns true when a matching
   * event is confirmed after attempting a write, including when a concurrent
   * append committed it. Conflicting content under the same ID is rejected.
   * Exhausted uncertain-outcome recovery refuses further appends on this
   * instance; lookups and reconstruction through a new log remain available.
   * The lookups include the event once this resolves.
   */
  append(event: HarnessAgentLogEvent): Promise<boolean>;

  /**
   * Registers a callback for matching new events and returns an unsubscribe
   * function. Each matching canonical event first observed while registered is
   * delivered once, in committed order, with an independent payload snapshot.
   * The callback is called synchronously as soon as a refresh or write adds
   * the event to the log's in-memory copy, after the lookups include it and
   * before that refresh or write resolves. Previously cached events are not
   * replayed.
   * Callback failures are isolated from persistence and other listeners, and
   * asynchronous callback work is not awaited. External writes are discovered
   * through advisory hints, polling, refreshes, or append reconciliation.
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

  /**
   * Fetches the events committed since the last fetch from the World and adds
   * them to the in-memory copy. Called where a decision depends on what other
   * processes may have written, e.g. at the start of a drive.
   */
  refresh(): Promise<void>;

  /**
   * Returns the submissions, in log order.
   */
  getSubmissions(): readonly HarnessAgentLogSubmissionEvent[];

  /**
   * Returns the submissions that no accepted `effect-start` delivered yet, in
   * log order.
   */
  getUndeliveredSubmissions(): readonly HarnessAgentLogSubmissionEvent[];

  /**
   * Returns the latest accepted attempt of an effect key.
   */
  getEffect(options: {
    /**
     * Key of the effect.
     */
    key: string;
  }): HarnessAgentLogEffectAttempt | undefined;

  /**
   * Returns the latest accepted attempt of each effect key, ordered by the
   * log position of those attempts' starts.
   */
  getEffects(options?: {
    /**
     * Only effect keys starting with this prefix.
     */
    keyPrefix?: string;

    /**
     * Only attempts started during this turn, i.e. accepted while it was the
     * current turn.
     */
    turnId?: string;
  }): readonly HarnessAgentLogEffectAttempt[];

  /**
   * Returns the turn of the latest `turn-start`, finished or not.
   */
  getCurrentTurn(): HarnessAgentLogTurn | undefined;

  /**
   * Returns all turns, in start order.
   */
  getTurns(): readonly HarnessAgentLogTurn[];

  /**
   * Returns the drive of the latest `drive-start`.
   */
  getLatestDrive(): HarnessAgentLogDrive | undefined;

  /**
   * Returns the adapter's own events, in log order. Backs the adapter-facing
   * log's `getAdapterEvents()`.
   */
  getAdapterEvents(options?: {
    /**
     * Only events of this type.
     */
    type?: `harness:${string}`;
  }): readonly HarnessAgentLogAdapterEvent[];

  /**
   * Returns whether the tool call attempt with the given start ID committed
   * its `tool-execution-start` event, i.e. whether its tool may have started
   * running. Recovery uses this to retry an abandoned tool call attempt
   * regardless of its replay policy when its tool provably never ran.
   *
   * This is a narrowly scoped helper for that one recovery rule, and only
   * applies to tool call attempts.
   *
   * TODO: Consider a cleaner way to represent the start of a tool's
   * execution, so that tool-specific state does not need its own lookup.
   */
  hasToolExecutionStart(options: {
    /**
     * ID of the attempt's `effect-start` event.
     */
    startId: string;
  }): boolean;
};

const LOG_STEP_NAME = 'harness-agent-log';
const PAGE_SIZE = 1000;
const MAX_RESENDS = 3;
const SLOW_WRITE_PROBE_MS = 2000;
const REFRESH_INTERVAL_MS = 15_000;

/**
 * Input for creating a session log backed by a Workflow World's events.
 */
type CreateLogOptions = {
  /**
   * World that stores the session's authoritative event history.
   */
  world: World;
  /**
   * Existing World run associated with the session.
   */
  runId: string;
};

/**
 * An agent event and its committed World slot.
 */
type LogRecord = {
  /**
   * Event visible to the agent and its adapter.
   */
  event: HarnessAgentLogEvent;
  /**
   * Committed World slot, independent of the event's caller-supplied ID.
   */
  position: number;
};

/**
 * One active callback and its position in the committed World log.
 */
type LogListener = {
  /**
   * Callback invoked when a new event matches this listener.
   */
  listener: (event: HarnessAgentLogEvent) => void;
  /**
   * Event-type allowlist and denylist applied before callback invocation.
   */
  config?: HarnessAgentLogListenerConfig;
  /**
   * Whether this registration still accepts events.
   */
  active: boolean;
  /**
   * Last whole-log position delivered to this listener.
   */
  lastDeliveredPosition: number;
};

/**
 * Resources owned by one generation of the shared hint watcher.
 */
type LogWatcher = {
  /**
   * Aborts reconnect delays when the last listener unsubscribes.
   */
  abortController: AbortController;
  /**
   * Current reader, including one whose read is pending.
   */
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  /**
   * Polling fallback for missing hints or an unavailable stream.
   */
  interval: ReturnType<typeof setInterval>;
};

/**
 * Decodes a World event into an agent log event. Returns `undefined` for World
 * events that are not agent log events. Throws for malformed records in the
 * agent log's namespace, since replay must not skip them.
 */
export async function decodeLogEvent(options: {
  /**
   * Committed World event.
   */
  event: Event;
}): Promise<HarnessAgentLogEvent | undefined> {
  const { event } = options;
  if (
    event.eventType !== 'step_created' ||
    event.eventData.stepName !== LOG_STEP_NAME
  )
    return;
  if (!(event.eventData.input instanceof Uint8Array)) {
    throw new Error('HarnessAgentLog: invalid storage envelope.');
  }
  const parsed = await parseJSON({
    text: new TextDecoder().decode(event.eventData.input),
  });
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('HarnessAgentLog: invalid storage envelope.');
  }
  const envelope = parsed as Record<string, JSONValue>;
  if (envelope.version !== 1 || !Object.hasOwn(envelope, 'event')) {
    throw new Error(
      'HarnessAgentLog: invalid or unsupported storage envelope.',
    );
  }
  const value = jsonDecodeSerializableValue({
    value: decodeJSONRecordValue({ value: envelope.event }),
  });
  if (!isValidHarnessAgentLogEvent(value)) {
    throw new Error('HarnessAgentLog: invalid stored event.');
  }
  return value as HarnessAgentLogEvent;
}

/**
 * Decodes a World event into an agent log event and its committed World slot.
 */
async function deserializeEvent(options: {
  /**
   * Committed World event.
   */
  event: Event;
}): Promise<LogRecord | undefined> {
  const decoded = await decodeLogEvent({ event: options.event });
  if (decoded == null) return;
  return { event: decoded, position: requireEventSlot(options.event.eventId) };
}

/**
 * Returns whether an event passes a listener's allowlist and denylist.
 */
function isListenerInterested(options: {
  /**
   * Listener's optional event-type allowlist and denylist.
   */
  config?: HarnessAgentLogListenerConfig;
  /**
   * Event to compare against the listener's configured filters.
   */
  event: HarnessAgentLogEvent;
}): boolean {
  return (
    (options.config?.types == null ||
      options.config.types.includes(options.event.type)) &&
    !options.config?.ignoreTypes?.includes(options.event.type)
  );
}

/**
 * Waits before a retry or reconnect. Watcher delays resolve on cancellation
 * and do not keep a Node process alive after its other work has completed.
 */
function delay(options: {
  /**
   * Delay in milliseconds.
   */
  ms: number;
  /**
   * Optional watcher lifecycle signal.
   */
  abortSignal?: AbortSignal;
}): Promise<void> {
  if (options.abortSignal?.aborted) return Promise.resolve();
  const pending = new DelayedPromise<void>();
  const finish = () => pending.resolve();
  const timer = setTimeout(finish, options.ms);
  if (options.abortSignal) {
    (timer as { unref?: () => void }).unref?.();
    options.abortSignal.addEventListener('abort', finish, { once: true });
  }
  return pending.promise.finally(() => {
    clearTimeout(timer);
    options.abortSignal?.removeEventListener('abort', finish);
  });
}

/**
 * Writable version of a lookup type, used while the log updates its lookups.
 */
type Mutable<T> = { -readonly [KEY in keyof T]: T[KEY] };

/**
 * Returns whether an effect output is an interruption that permits another
 * attempt.
 */
function isRetryableInterruption(output?: HarnessV2EffectOutput): boolean {
  return output?.type === 'interrupted' && output.retryable;
}

/**
 * Creates a log stored as ordered events in the given existing World run.
 * World slots are whole-log positions, including infrastructure records and
 * physical duplicates. Reads expose only the first committed logical event.
 * Appends await durable confirmation; uncertain outcomes are reconciled before
 * resending, and exhausted recovery refuses further writes on this instance.
 * Append listeners follow advisory hints and periodically refresh the log, so
 * stream loss or transport chunk boundaries never determine durable state.
 *
 * The lookups are updated once for each new event, in log order, before
 * listeners are notified. This is the one place that decides what log events
 * mean for the session:
 *
 * - An `effect-start` is accepted only if its `attempt` is the next attempt
 *   of its key and the key's previous attempt, if any, ended with a
 *   retryable interruption. An accepted start becomes the latest attempt of
 *   its key, is filed under the turn that is current at that moment, and
 *   marks the submissions it delivers as delivered.
 * - `effect-progress` and `effect-end` events only apply to an accepted
 *   attempt that is still the latest of its key and has not ended. Progress
 *   replaces earlier progress; only the first end counts.
 * - A `turn-start` adds a turn and makes it current. Its submissions are the
 *   prompt submission whose ID is the turn ID, which is currently how turns
 *   are identified. `finish-step` events add steps to their turn, and the
 *   first `finish-turn` event of a turn finishes it.
 * - A `drive-start` adds a drive and makes it the latest one; a
 *   `drive-crash` is attached to the drive it names.
 * - `tool-execution-start` events mark the tool call attempt they name.
 *   `crash-request` events do not affect the lookups.
 */
export function createLog({ world, runId }: CreateLogOptions): HarnessAgentLog {
  const listeners = new Set<LogListener>();
  const byId = new Map<string, LogRecord>();
  const hintStreamName = runId + '_harness_agent_log_hints';
  let position = 0;
  let cursor: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let refreshRequested = false;
  let watcher: LogWatcher | undefined;
  let writeFailure: Error | undefined;
  let lookupFailure: Error | undefined;
  let publishingHint = false;
  let hintRequested = false;

  const submissions: HarnessAgentLogSubmissionEvent[] = [];
  const delivered = new Set<string>();

  /**
   * Latest accepted attempt of each effect key. A key is moved to the end
   * whenever it gets a new attempt, so iteration follows the log position of
   * the latest attempts' starts.
   */
  const latestAttempts = new Map<
    string,
    Mutable<HarnessAgentLogEffectAttempt>
  >();
  const attemptsByStartId = new Map<
    string,
    Mutable<HarnessAgentLogEffectAttempt>
  >();
  const attemptTurns = new Map<string, string>();
  const toolExecutionStarts = new Set<string>();
  const turns: Mutable<HarnessAgentLogTurn>[] = [];
  const turnsById = new Map<string, Mutable<HarnessAgentLogTurn>>();
  const drives = new Map<string, Mutable<HarnessAgentLogDrive>>();
  const crashes = new Map<string, HarnessAgentLogDriveCrashEvent>();
  let latestDrive: HarnessAgentLogDrive | undefined;
  const adapterEvents: HarnessAgentLogAdapterEvent[] = [];

  /**
   * Throws if an event could not be applied to the lookups. They would no
   * longer reflect the log, so this log instance must not be used anymore.
   */
  function checkLookups(): void {
    if (lookupFailure) throw lookupFailure;
  }

  /**
   * Returns the attempt a progress or end event applies to, if any.
   */
  function getOpenAttempt(options: {
    /**
     * ID of the attempt's `effect-start` event.
     */
    startId: string;
  }): Mutable<HarnessAgentLogEffectAttempt> | undefined {
    const attempt = attemptsByStartId.get(options.startId);
    if (
      attempt == null ||
      attempt.end != null ||
      latestAttempts.get(attempt.start.data.key) !== attempt
    ) {
      return undefined;
    }
    return attempt;
  }

  /**
   * Applies an `effect-start` to the lookups, if it is accepted.
   */
  function applyEffectStart(options: {
    /**
     * Start event to apply.
     */
    event: HarnessAgentLogEffectStartEvent;
  }): void {
    const { event } = options;
    const { key, attempt, deliveredSubmissionIds } = event.data;
    const previous = latestAttempts.get(key);
    if (attempt !== (previous?.start.data.attempt ?? 0) + 1) return;
    if (
      previous != null &&
      !isRetryableInterruption(previous.end?.data.output)
    ) {
      return;
    }

    const accepted: Mutable<HarnessAgentLogEffectAttempt> = { start: event };
    latestAttempts.delete(key);
    latestAttempts.set(key, accepted);
    attemptsByStartId.set(event.id, accepted);
    const currentTurn = turns.at(-1);
    if (currentTurn != null) {
      attemptTurns.set(event.id, currentTurn.start.data.turnId);
    }
    for (const submissionId of deliveredSubmissionIds) {
      delivered.add(submissionId);
    }
  }

  /**
   * Applies one new event to the lookups. Events must be applied once each,
   * in log order.
   */
  function applyEvent(options: {
    /**
     * New event, the first committed one with its ID.
     */
    event: HarnessAgentLogEvent;
  }): void {
    const { event } = options;
    switch (event.type) {
      case 'submission':
        submissions.push(event);
        return;

      case 'effect-start':
        applyEffectStart({ event });
        return;

      case 'effect-progress': {
        const attempt = getOpenAttempt({ startId: event.data.startId });
        if (attempt != null) attempt.progress = event;
        return;
      }

      case 'effect-end': {
        const attempt = getOpenAttempt({ startId: event.data.startId });
        if (attempt != null) attempt.end = event;
        return;
      }

      case 'tool-execution-start':
        toolExecutionStarts.add(event.data.startId);
        return;

      case 'turn-start': {
        const { turnId } = event.data;
        if (turnsById.has(turnId)) return;
        const submission = submissions.find(item => item.id === turnId);
        const turn: Mutable<HarnessAgentLogTurn> = {
          start: event,
          submissions: submission?.data.type === 'prompt' ? [submission] : [],
          steps: [],
        };
        turns.push(turn);
        turnsById.set(turnId, turn);
        return;
      }

      case 'finish-step': {
        const turn = turnsById.get(event.data.turnId);
        if (turn != null) turn.steps = [...turn.steps, event];
        return;
      }

      case 'finish-turn': {
        const turn = turnsById.get(event.data.turnId);
        if (turn != null && turn.finish == null) turn.finish = event;
        return;
      }

      case 'drive-start': {
        const { driveId } = event.data;
        if (drives.has(driveId)) return;
        const drive: Mutable<HarnessAgentLogDrive> = { start: event };
        const crash = crashes.get(driveId);
        if (crash != null) drive.crash = crash;
        drives.set(driveId, drive);
        latestDrive = drive;
        return;
      }

      case 'drive-crash': {
        const { driveId } = event.data;
        if (crashes.has(driveId)) return;
        crashes.set(driveId, event);
        const drive = drives.get(driveId);
        if (drive != null) drive.crash = event;
        return;
      }

      case 'crash-request':
        return;

      default:
        adapterEvents.push(event);
    }
  }

  /**
   * Serializes every mutation of the committed prefix and canonical indexes.
   */
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    queued++;
    const result = queue.then(fn, fn).finally(() => {
      queued--;
      if (queued === 0 && refreshRequested) scheduleRefresh();
    });
    queue = result.catch(() => {});
    return result;
  }

  /**
   * Passes events that were just added to the log's in-memory copy to the
   * registered listeners. A failing listener can neither make a durable
   * append fail nor keep other listeners from being called.
   */
  function notify(options: {
    /**
     * Newly accepted canonical records.
     */
    fresh: LogRecord[];
  }): void {
    for (const record of options.fresh) {
      for (const listener of [...listeners]) {
        if (
          !listener.active ||
          record.position <= listener.lastDeliveredPosition
        )
          continue;
        listener.lastDeliveredPosition = record.position;
        if (
          !isListenerInterested({
            config: listener.config,
            event: record.event,
          })
        )
          continue;
        try {
          const result = listener.listener(
            cloneSerializableValue({
              value: record.event as SerializableValue,
            }) as HarnessAgentLogEvent,
          );
          void Promise.resolve(result).catch(() => {});
        } catch {}
      }
    }
  }

  /**
   * Validates an entire page before committing its prefix or cursor. A failed
   * decode therefore leaves that page available to every subsequent refresh.
   * The page's new events are then added to the in-memory copy of the log
   * and passed to the listeners.
   */
  async function foldPage(options: {
    /**
     * Ordered World records, possibly overlapping the existing prefix.
     */
    events: Event[];
    /**
     * Opaque continuation cursor supplied by the World.
     */
    nextCursor?: string;
  }): Promise<void> {
    checkLookups();
    let nextPosition = position;
    const decoded: LogRecord[] = [];
    for (const event of options.events) {
      const slot = requireEventSlot(event.eventId);
      if (event.runId !== runId)
        throw new Error('HarnessAgentLog: event belongs to another run.');
      if (slot <= nextPosition) continue;
      if (slot !== nextPosition + 1)
        throw new Error('HarnessAgentLog: incomplete World event prefix.');
      const record = await deserializeEvent({ event });
      if (record) decoded.push(record);
      nextPosition = slot;
    }
    const fresh: LogRecord[] = [];
    for (const record of decoded) {
      if (byId.has(record.event.id)) continue;
      byId.set(record.event.id, record);
      fresh.push(record);
    }
    position = nextPosition;
    if (options.nextCursor != null) cursor = options.nextCursor;
    for (const record of fresh) {
      try {
        applyEvent({ event: record.event });
      } catch (error) {
        lookupFailure = Object.assign(
          new Error(
            'HarnessAgentLog: event could not be applied; recreate the log.',
          ),
          { cause: error },
        );
        throw lookupFailure;
      }
    }
    notify({ fresh });
  }

  /**
   * Fetches pages of World events until the end and adds each page's new
   * events to the in-memory copy of the log, keeping the cursor of the last
   * page.
   */
  async function refreshUnlocked(): Promise<void> {
    for (;;) {
      const page = await world.events.list({
        runId,
        pagination: { sortOrder: 'asc', limit: PAGE_SIZE, cursor },
        resolveData: 'all',
      });
      const previousCursor = cursor;
      await foldPage({
        events: page.data,
        nextCursor: page.cursor ?? undefined,
      });
      if (!page.hasMore) return;
      if (cursor === previousCursor || page.cursor == null)
        throw new Error('HarnessAgentLog: World pagination did not advance.');
    }
  }

  /**
   * Coalesces hints without accumulating work behind an active read or write.
   */
  function scheduleRefresh(): void {
    refreshRequested = listeners.size > 0;
    if (!refreshRequested || queued > 0) return;
    refreshRequested = false;
    void exclusive(refreshUnlocked).catch(() => {});
  }

  /**
   * Reports the canonical outcome of an append. Identity binds encoded event
   * content; a losing conflicting physical record never replaces the winner.
   */
  function isCommitted(options: {
    /**
     * Immutable event whose committed content must match.
     */
    event: HarnessAgentLogEvent;
  }): boolean {
    const canonical = byId.get(options.event.id);
    if (!canonical) return false;
    if (
      JSON.stringify(
        jsonEncodeSerializableValue({
          value: canonical.event as SerializableValue,
        }),
      ) !==
      JSON.stringify(
        jsonEncodeSerializableValue({
          value: options.event as SerializableValue,
        }),
      )
    )
      throw new Error(
        'HarnessAgentLog: event ID already has different content.',
      );
    return true;
  }

  /**
   * Publishes a coalesced best-effort hint without delaying durable appends.
   */
  function publishHint(): void {
    hintRequested = true;
    if (publishingHint) return;
    publishingHint = true;
    hintRequested = false;
    void Promise.resolve()
      .then(() => world.streams.write(runId, hintStreamName, '\n'))
      .catch(() => {})
      .finally(() => {
        publishingHint = false;
        if (hintRequested) publishHint();
      });
  }

  /**
   * Recognizes a committed write while its response is stalled. Probes share
   * the append's exclusive access; late responses never mutate cached state.
   */
  async function awaitWrite(options: {
    /**
     * Pending transport request whose rejection remains observed.
     */
    pending: Promise<EventResult>;
    /**
     * Event being reconciled by its stable ID.
     */
    event: HarnessAgentLogEvent;
  }): Promise<EventResult | undefined> {
    let settled = false;
    const pending = options.pending.finally(() => {
      settled = true;
    });
    void pending.catch(() => {});
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), SLOW_WRITE_PROBE_MS);
      });
      const result = await Promise.race([pending, tick]).finally(() =>
        clearTimeout(timer),
      );
      if (settled) return pending;
      if (result !== undefined) return result;
      try {
        await refreshUnlocked();
      } catch {}
      if (settled) return pending;
      if (isCommitted({ event: options.event })) return;
    }
  }

  /**
   * Uses a write report only when it covers every missing slot through our
   * commit. Missing or partial reports fall back to authoritative listing.
   */
  async function foldWrite(options: {
    /**
     * World write result.
     */
    result: EventResult;
  }): Promise<void> {
    const own = options.result.event;
    if (!own) return refreshUnlocked();
    const ownSlot = requireEventSlot(own.eventId);
    const events = [...(options.result.events ?? [])];
    if (!events.some(event => event.eventId === own.eventId)) events.push(own);
    const fresh = events.filter(
      event => requireEventSlot(event.eventId) > position,
    );
    const complete =
      fresh.every(
        (event, index) =>
          requireEventSlot(event.eventId) === position + index + 1,
      ) &&
      (fresh.at(-1)?.eventId === own.eventId || ownSlot <= position);
    if (complete) await foldPage({ events: fresh });
    else await refreshUnlocked();
  }

  /**
   * Reconciles rejected writes before resending. Repeated read failure never
   * authorizes another write; exhausting recovery latches a fail-stop state.
   */
  async function appendUnlocked(options: {
    /**
     * Immutable append snapshot with a stable event ID.
     */
    event: HarnessAgentLogEvent;
    /**
     * Encoded envelope reused unchanged by physical resend attempts.
     */
    bytes: Uint8Array;
  }): Promise<boolean> {
    if (writeFailure) throw writeFailure;
    checkLookups();
    await refreshUnlocked();
    if (isCommitted({ event: options.event })) return false;
    let cause: unknown;
    for (let attempt = 0; attempt <= MAX_RESENDS; attempt++) {
      try {
        const result = await awaitWrite({
          event: options.event,
          pending: world.events.create(
            runId,
            {
              eventType: 'step_created',
              correlationId: 'step_' + generateId(),
              eventData: {
                stepName: LOG_STEP_NAME,
                input: options.bytes.slice(),
              },
            },
            { eventCount: position, resolveData: 'all' },
          ),
        });
        if (result) await foldWrite({ result });
      } catch (error) {
        cause = error;
      }
      let reconciled = false;
      for (let lookup = 0; lookup <= MAX_RESENDS; lookup++) {
        if (isCommitted({ event: options.event })) {
          publishHint();
          return true;
        }
        try {
          await refreshUnlocked();
          reconciled = true;
          break;
        } catch (error) {
          cause = error;
          if (lookup < MAX_RESENDS)
            await delay({ ms: Math.min(50 * (lookup + 1), 500) });
        }
      }
      if (isCommitted({ event: options.event })) {
        publishHint();
        return true;
      }
      if (!reconciled || attempt === MAX_RESENDS) break;
      await delay({ ms: Math.min(50 * (attempt + 1), 500) });
    }
    writeFailure = Object.assign(
      new Error(
        'HarnessAgentLog: append outcome could not be confirmed; recreate the log before writing again.',
      ),
      { cause },
    );
    throw writeFailure;
  }

  /**
   * Watches advisory bytes, reopening at the tail after disconnects. Every
   * connection also refreshes authoritative state; skipped hints are harmless.
   */
  async function watchHints(options: {
    /**
     * Watcher generation to own and clean up.
     */
    current: LogWatcher;
  }): Promise<void> {
    const { current } = options;
    const abortSignal = current.abortController.signal;
    let backoff = 1000;
    while (!abortSignal.aborted) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let received = false;
      try {
        const start = await world.streams.getInfo(runId, hintStreamName).then(
          info => info.tailIndex + 1,
          () => 0,
        );
        if (abortSignal.aborted) return;
        const stream = await world.streams.get(runId, hintStreamName, start);
        if (abortSignal.aborted) {
          await stream.cancel().catch(() => {});
          return;
        }
        reader = stream.getReader();
        current.reader = reader;
        scheduleRefresh();
        while (!abortSignal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received = true;
          scheduleRefresh();
        }
      } catch {
      } finally {
        if (reader) {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
          if (current.reader === reader) current.reader = undefined;
        }
      }
      if (abortSignal.aborted) return;
      await delay({ ms: backoff, abortSignal });
      backoff = received ? 1000 : Math.min(backoff * 2, 10_000);
    }
  }

  return {
    async append(event) {
      const encoded = jsonEncodeSerializableValue({
        value: {
          type: event.type,
          data: event.data,
          id: event.id,
        } as SerializableValue,
      });
      const snapshot = jsonDecodeSerializableValue({
        value: encoded,
      }) as HarnessAgentLogEvent;
      const bytes = new TextEncoder().encode(
        encodeJSONRecord({
          record: { version: 1, event: encoded },
          field: 'event',
        }),
      );
      return exclusive(() => appendUnlocked({ event: snapshot, bytes }));
    },

    refresh() {
      return exclusive(async () => {
        checkLookups();
        await refreshUnlocked();
      });
    },

    getSubmissions() {
      checkLookups();
      return [...submissions];
    },

    getUndeliveredSubmissions() {
      checkLookups();
      return submissions.filter(submission => !delivered.has(submission.id));
    },

    getEffect({ key }) {
      checkLookups();
      return latestAttempts.get(key);
    },

    getEffects({ keyPrefix, turnId } = {}) {
      checkLookups();
      return [...latestAttempts.values()].filter(
        attempt =>
          (keyPrefix == null || attempt.start.data.key.startsWith(keyPrefix)) &&
          (turnId == null || attemptTurns.get(attempt.start.id) === turnId),
      );
    },

    getCurrentTurn() {
      checkLookups();
      return turns.at(-1);
    },

    getTurns() {
      checkLookups();
      return [...turns];
    },

    getLatestDrive() {
      checkLookups();
      return latestDrive;
    },

    getAdapterEvents({ type } = {}) {
      checkLookups();
      return adapterEvents.filter(event => type == null || event.type === type);
    },

    hasToolExecutionStart({ startId }) {
      checkLookups();
      return toolExecutionStarts.has(startId);
    },

    onAppend({ listener, config }) {
      const record: LogListener = {
        listener,
        config: config && {
          types: config.types?.slice(),
          ignoreTypes: config.ignoreTypes?.slice(),
        },
        active: true,
        lastDeliveredPosition: position,
      };
      listeners.add(record);
      if (!watcher) {
        const current: LogWatcher = {
          abortController: new AbortController(),
          interval: setInterval(scheduleRefresh, REFRESH_INTERVAL_MS),
        };
        (current.interval as { unref?: () => void }).unref?.();
        watcher = current;
        void watchHints({ current }).catch(() => {});
      }
      scheduleRefresh();
      return () => {
        record.active = false;
        listeners.delete(record);
        if (listeners.size === 0 && watcher) {
          const current = watcher;
          watcher = undefined;
          refreshRequested = false;
          clearInterval(current.interval);
          current.abortController.abort();
          void current.reader?.cancel().catch(() => {});
        }
      };
    },
  };
}
