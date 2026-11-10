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
import type {
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentLogListenerConfig,
} from './types';

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
   * Delivers newly folded canonical events. Listener failures cannot turn a
   * durable append into a failure or prevent other registrations being called.
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
   * Fetches and folds successive complete pages, retaining the tail cursor.
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
