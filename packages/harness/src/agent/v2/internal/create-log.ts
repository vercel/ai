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
import { isValidHarnessAgentLogEvent } from './is-valid-harness-agent-log-event';
import type { HarnessV2LogEvent } from '../../../v2/harness-v2-log';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2Usage,
} from '../../../v2/harness-v2-stream-part';

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
    }
  | {
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
    }
  | {
      /**
       * Records the start of a drive, visible only to the agent engine.
       * Written under the ID `drive-start:${driveId}` before the drive
       * changes anything else in the session. Recovery uses the latest one
       * to decide whether the drive that left attempts unfinished is gone.
       */
      readonly type: 'drive-start';

      /**
       * Drive identity and the time by which its process is terminated.
       */
      readonly data: {
        /**
         * Identifier of the drive.
         */
        readonly driveId: string;

        /**
         * Runtime deadline of the drive's process in epoch milliseconds, if
         * the World reports one. Once it passed, the drive is gone.
         */
        readonly deadline?: number;
      };

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    }
  | {
      /**
       * Asks the drive running the session's current turn to crash its
       * process, visible only to the agent engine. Written by
       * `experimental_crash()`. It applies to the latest `drive-start`
       * before it.
       */
      readonly type: 'crash-request';

      /**
       * No data.
       */
      readonly data: Record<string, never>;

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    }
  | {
      /**
       * Records that a drive is about to crash its process on request,
       * visible only to the agent engine. Written under the ID
       * `drive-crash:${driveId}` right before the process is killed, so it
       * proves to recovery that the drive is gone.
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
    }
  | {
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
 * Decodes a namespaced World event. Unrelated events carry no agent state;
 * malformed records in the reserved namespace must not be skipped by replay.
 */
async function deserializeEvent(options: {
  /**
   * Committed World event.
   */
  event: Event;
}): Promise<LogRecord | undefined> {
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
  const value = jsonDecodeSerializableValue({ value: envelope.event });
  if (!isValidHarnessAgentLogEvent(value)) {
    throw new Error('HarnessAgentLog: invalid stored event.');
  }
  return {
    event: value as HarnessAgentLogEvent,
    position: requireEventSlot(event.eventId),
  };
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
 * Creates a log stored as ordered events in the given existing World run.
 * World slots are whole-log positions, including infrastructure records and
 * physical duplicates. Reads expose only the first committed logical event.
 * Appends await durable confirmation; uncertain outcomes are reconciled before
 * resending, and exhausted recovery refuses further writes on this instance.
 * Append listeners follow advisory hints and periodically refresh the log, so
 * stream loss or transport chunk boundaries never determine durable state.
 */
export function createLog({ world, runId }: CreateLogOptions): HarnessAgentLog {
  const listeners = new Set<LogListener>();
  const records: LogRecord[] = [];
  const byId = new Map<string, LogRecord>();
  const hintStreamName = runId + '_harness_agent_log_hints';
  let position = 0;
  let cursor: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let refreshRequested = false;
  let watcher: LogWatcher | undefined;
  let writeFailure: Error | undefined;
  let publishingHint = false;
  let hintRequested = false;

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
      records.push(record);
      fresh.push(record);
    }
    position = nextPosition;
    if (options.nextCursor != null) cursor = options.nextCursor;
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
    read(options) {
      return exclusive(async () => {
        await refreshUnlocked();
        return {
          events: records
            .filter(
              record =>
                record.position > Math.max(0, options?.after ?? 0) &&
                (options?.types == null ||
                  options.types.includes(record.event.type)),
            )
            .map(
              record =>
                cloneSerializableValue({
                  value: record.event as SerializableValue,
                }) as HarnessAgentLogEvent,
            ),
          position,
        };
      });
    },

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
        JSON.stringify({ version: 1, event: encoded }),
      );
      return exclusive(() => appendUnlocked({ event: snapshot, bytes }));
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
