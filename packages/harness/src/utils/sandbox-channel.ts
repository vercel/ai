import {
  safeParseJSON,
  safeValidateTypes,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import type { WebSocket } from 'ws';
import { sleep } from './sleep';

/**
 * Diagnostic event surfaced by {@link SandboxChannel} during its connection
 * lifecycle. Silent unless a consumer wires `onDebug`. Reconnects are otherwise
 * invisible — the channel reconnects transparently and the in-flight turn keeps
 * streaming.
 */
export type SandboxChannelDebugEvent =
  | { event: 'reconnect-attempt'; attempt: number; lastSeenEventId: number }
  | { event: 'reconnected'; attempt: number; lastSeenEventId: number }
  | {
      event: 'reconnect-failed';
      attempts: number;
      lastSeenEventId: number;
      cause: unknown;
    };

export interface SandboxChannelReconnectOptions {
  /**
   * Give up reconnecting after this many milliseconds, including connection
   * establishment and backoff delays. Default 30_000.
   */
  readonly maxElapsedMs?: number;
  /** First backoff delay. Default 50. */
  readonly initialDelayMs?: number;
  /** Backoff ceiling. Default 2_000. */
  readonly maxDelayMs?: number;
}

export interface SandboxChannelConnectOptions {
  readonly abortSignal: AbortSignal;
}

export interface SandboxChannelOptions<TOut> {
  /**
   * Open a fresh WebSocket to the bridge and resolve once it is ready to carry
   * frames (i.e. after any adapter-specific handshake such as Claude Code's
   * `bridge-hello`). Called once by {@link SandboxChannel.open} and again on
   * every transient reconnect. Must reject if the connection cannot be
   * established.
   */
  connect: (options: SandboxChannelConnectOptions) => Promise<WebSocket>;

  /** Schema validating inbound (bridge → host) frames. */
  outboundSchema: FlexibleSchema<TOut>;

  reconnect?: SandboxChannelReconnectOptions;

  onDebug?: (event: SandboxChannelDebugEvent) => void;

  /**
   * Sink for forwarded bridge diagnostics — `sandbox-log` (captured
   * console lines) and `debug-event` (structured) frames. When set, these
   * frame types are routed here instead of the per-type listener dispatch, so
   * they never reach the consumer's stream. Typed to the diagnostic members of
   * `TOut`, so it is a no-op union for channels whose protocol has none.
   */
  onDiagnostic?: (
    event: Extract<TOut, { type: 'sandbox-log' | 'debug-event' }>,
  ) => void;

  onBridgeError?: (event: Extract<TOut, { type: 'error' }>) => void;

  /**
   * Seed the host-side cursor before the first connect. Pass the
   * `lastSeenEventId` persisted from a prior process so the bridge replays only
   * events past it when this channel opens with `{ resume: true }` — the
   * cross-process attach handshake. Defaults to `0` (fresh session).
   */
  initialLastSeenEventId?: number;
}

type EventTypeOf<TOut extends { type: string }> = TOut['type'];

type Listener<TOut extends { type: string }, T extends EventTypeOf<TOut>> = (
  event: Extract<TOut, { type: T }>,
) => void;

/*
 * The agent and utilities entrypoints bundle this module separately. A global
 * symbol lets the agent recognize metadata attached by the channel's bundle
 * copy, while the non-enumerable property leaves protocol payloads unchanged.
 */
const sandboxChannelEventCheckpointSymbol = Symbol.for(
  'vercel.ai.harness.sandboxChannelEventCheckpoint',
);

type SandboxChannelEventCheckpoint = {
  pin: () => () => void;
};

export function pinSandboxChannelEventCheckpoint(
  event: unknown,
): (() => void) | undefined {
  if (event == null || typeof event !== 'object') return undefined;
  return (
    event as {
      [sandboxChannelEventCheckpointSymbol]?: SandboxChannelEventCheckpoint;
    }
  )[sandboxChannelEventCheckpointSymbol]?.pin();
}

function getAbortReason({
  abortSignal,
}: {
  abortSignal: AbortSignal;
}): unknown {
  return abortSignal.reason ?? new Error('SandboxChannel connection aborted');
}

function closeWebSocket({ ws }: { ws: WebSocket }): void {
  try {
    const terminable = ws as WebSocket & { terminate?: () => void };
    if (terminable.terminate != null) {
      terminable.terminate();
    } else {
      ws.close();
    }
  } catch {
    try {
      ws.close();
    } catch {
      // best-effort
    }
  }
}

async function awaitWebSocketConnection({
  connection,
  abortSignal,
}: {
  connection: Promise<WebSocket>;
  abortSignal: AbortSignal;
}): Promise<WebSocket> {
  if (abortSignal.aborted) {
    void connection.then(ws => closeWebSocket({ ws })).catch(() => {});
    throw getAbortReason({ abortSignal });
  }

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(getAbortReason({ abortSignal }));
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    const ws = await Promise.race([connection, aborted]);
    if (abortSignal.aborted) {
      closeWebSocket({ ws });
      throw getAbortReason({ abortSignal });
    }
    return ws;
  } catch (error) {
    if (abortSignal.aborted) {
      void connection.then(ws => closeWebSocket({ ws })).catch(() => {});
    }
    throw error;
  } finally {
    if (onAbort != null) {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }
}

/**
 * Host-side typed wrapper around the bridge WebSocket connection.
 *
 * Buffers inbound messages in arrival order while listeners attach, so callers
 * do not miss or reorder early frames. Listener registration drains the ordered
 * prefix synchronously. If an event type remains unhandled after the current
 * attachment turn, it is retained independently so it cannot block subscribed
 * event types indefinitely. Inbound dispatch is serialised through a promise
 * chain so a `close` event that arrives on the same microtask as the final
 * `finish` message does not fire close handlers until the message has been
 * dispatched.
 *
 * Survives transient disconnects. The bridge keeps running and
 * accumulates events in an in-memory log keyed by a monotonic `seq`; on an
 * unexpected socket drop this channel re-invokes `connect`, re-wires the new
 * socket, and asks the bridge to replay everything past `lastSeenEventId`. The
 * in-flight turn never observes the blip — `onClose` fires only after a
 * host-initiated close or once the reconnect budget is exhausted.
 */
export class SandboxChannel<
  TOut extends { type: string },
  TIn extends { type: string } = { type: string },
> {
  private readonly listeners = new Map<
    EventTypeOf<TOut>,
    Set<Listener<TOut, EventTypeOf<TOut>>>
  >();
  private readonly buffered: TOut[] = [];
  private readonly bufferedByType = new Map<EventTypeOf<TOut>, TOut[]>();
  private bufferedOffset = 0;
  private flushingBuffered = false;
  private bufferedFlushScheduled = false;
  private readonly onCloseHandlers = new Set<
    (code: number, reason: string) => void
  >();
  private readonly onReconnectHandlers = new Set<() => void>();

  private readonly connectThunk: (
    options: SandboxChannelConnectOptions,
  ) => Promise<WebSocket>;
  private readonly outboundSchema: FlexibleSchema<TOut>;
  private readonly onDebug:
    | ((event: SandboxChannelDebugEvent) => void)
    | undefined;
  private readonly onDiagnostic:
    | ((event: Extract<TOut, { type: 'sandbox-log' | 'debug-event' }>) => void)
    | undefined;
  private readonly onBridgeError:
    | ((event: Extract<TOut, { type: 'error' }>) => void)
    | undefined;
  private readonly maxElapsedMs: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  private ws: WebSocket | undefined;
  private connected = false;
  /** Host has begun teardown; suppresses reconnect so a bridge-side close finalises. */
  private closing = false;
  /**
   * Host has gracefully suspended (slice boundary). Inbound frames are ignored
   * from this point so the cursor stops advancing exactly at the last delivered
   * event — the bridge keeps the turn running and the not-yet-delivered tail is
   * replayed to the next process on `resume`.
   */
  private suspended = false;
  private pinnedSuspensionCursor:
    | { eventId: number; token: object }
    | undefined;
  /** Channel is fully torn down; `send` throws and `onClose` has fired. */
  private terminal = false;
  private _lastSeenEventId = 0;
  private readonly pendingSends: string[] = [];
  private dispatchChain: Promise<void> = Promise.resolve();
  private activeConnectAbortController: AbortController | undefined;
  private reconnectAbortController: AbortController | undefined;

  constructor(options: SandboxChannelOptions<TOut>) {
    this.connectThunk = options.connect;
    this.outboundSchema = options.outboundSchema;
    this.onDebug = options.onDebug;
    this.onDiagnostic = options.onDiagnostic;
    this.onBridgeError = options.onBridgeError;
    this.maxElapsedMs = options.reconnect?.maxElapsedMs ?? 30_000;
    this.initialDelayMs = options.reconnect?.initialDelayMs ?? 50;
    this.maxDelayMs = options.reconnect?.maxDelayMs ?? 2_000;
    this._lastSeenEventId = options.initialLastSeenEventId ?? 0;
  }

  /**
   * Highest bridge event `seq` this channel has observed. Persist it (e.g. via
   * the adapter's resume handle) so a future process can seed
   * {@link SandboxChannelOptions.initialLastSeenEventId} and attach.
   */
  get lastSeenEventId(): number {
    return this._lastSeenEventId;
  }

  /**
   * Establish the initial connection. A single attempt — startup failures
   * reject so the caller can fail `doStart` cleanly. Reconnect retries apply
   * only to drops after a successful open.
   *
   * Pass `{ resume: true }` to attach to a bridge that is already mid-session:
   * after the socket opens, the channel sends `{ type: 'resume', lastSeenEventId }`
   * so the bridge replays everything past the seeded cursor. This is the
   * cross-process attach handshake — identical to what a transient reconnect
   * does, but triggered by the initial open from a new process.
   */
  async open(opts?: { resume?: boolean }): Promise<void> {
    if (this.terminal) {
      throw new Error('SandboxChannel: cannot open a closed channel.');
    }
    const abortController = new AbortController();
    this.activeConnectAbortController = abortController;
    try {
      const ws = await this.connect({
        abortSignal: abortController.signal,
      });
      this.wire(ws);
      this.ws = ws;
      this.connected = true;
      if (opts?.resume) {
        this.rawSend(
          JSON.stringify({
            type: 'resume',
            lastSeenEventId: this._lastSeenEventId,
          }),
        );
      }
    } finally {
      if (this.activeConnectAbortController === abortController) {
        this.activeConnectAbortController = undefined;
      }
    }
  }

  on<T extends EventTypeOf<TOut>>(
    type: T,
    listener: Listener<TOut, T>,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as unknown as Listener<TOut, EventTypeOf<TOut>>);

    this.flushBufferedType(type);
    this.flushBuffered();
    this.scheduleSelectiveBufferedFlush();

    return () => {
      set!.delete(listener as unknown as Listener<TOut, EventTypeOf<TOut>>);
    };
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.onCloseHandlers.add(handler);
  }

  onReconnect(handler: () => void): () => void {
    this.onReconnectHandlers.add(handler);
    return () => {
      this.onReconnectHandlers.delete(handler);
    };
  }

  send(message: TIn): void {
    if (this.terminal) {
      throw new Error(
        `SandboxChannel: cannot send ${message.type} — channel is closed.`,
      );
    }
    this.rawSend(JSON.stringify(message));
  }

  /**
   * Mark that the host is tearing the session down. The next socket close is
   * then treated as terminal rather than triggering a reconnect. Call before
   * sending a `stop` / `destroy` message whose completion closes the bridge
   * socket.
   */
  beginClose(): void {
    this.closing = true;
    this.abortActiveConnect();
  }

  close(): void {
    if (this.terminal) return;
    this.closing = true;
    this.abortActiveConnect();
    try {
      this.ws?.close();
    } catch {
      // best-effort
    }
    this.enqueue(() => this.finalizeClose(1000, 'closed'));
  }

  /**
   * Gracefully suspend at a slice boundary: stop processing inbound frames
   * (so the cursor freezes at the last delivered event), drain any frames
   * already queued for dispatch, then close the socket and finalise with the
   * close reason `'suspended'`. Resolves with the final `lastSeenEventId`.
   *
   * The bridge keeps the in-flight turn running (a host socket close never
   * aborts it) and accumulates events past the cursor for the next process to
   * `resume`. Unlike {@link close}, the consumer's active turn is wound down
   * cleanly — adapters distinguish a suspend from an unexpected drop via the
   * `'suspended'` close reason and resolve `done` successfully. When an event
   * checkpoint is pinned, the returned cursor points to that event so any
   * already-dispatched tail is replayed by the next process.
   */
  suspend(): Promise<number> {
    return new Promise<number>(resolve => {
      const pinnedSuspensionCursor = this.pinnedSuspensionCursor?.eventId;
      if (this.terminal) {
        resolve(pinnedSuspensionCursor ?? this._lastSeenEventId);
        return;
      }
      // Stop counting/dispatching further inbound frames immediately, and
      // suppress reconnect so the socket close finalises.
      this.suspended = true;
      this.closing = true;
      this.abortActiveConnect();
      this.onClose(() =>
        resolve(pinnedSuspensionCursor ?? this._lastSeenEventId),
      );
      // Queue the close behind any already-dispatched frames so everything
      // delivered to the consumer is reflected in the final cursor.
      this.enqueue(() => {
        try {
          this.ws?.close();
        } catch {
          // best-effort
        }
        this.finalizeClose(1000, 'suspended');
      });
    });
  }

  isClosed(): boolean {
    return this.terminal;
  }

  // ─── internals ──────────────────────────────────────────────────────

  private wire(ws: WebSocket): void {
    let dropped = false;
    const onDrop = (code: number, reason: string) => {
      if (dropped) return;
      dropped = true;
      if (ws !== this.ws) return;
      this.connected = false;
      if (this.closing) {
        this.enqueue(() => this.finalizeClose(code, reason));
      } else {
        this.enqueue(() => this.reconnectLoop());
      }
    };

    ws.on('message', (raw: ArrayBufferLike | string) => {
      // Once suspended, ignore further frames so the cursor freezes exactly at
      // the last delivered event (the bridge replays the rest to the next slice).
      if (this.suspended) return;
      const text =
        typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
      this.enqueue(() => this.handleIncoming(text));
    });
    ws.on('close', (code: number, reason: Buffer) =>
      onDrop(code, reason?.toString?.('utf8') ?? ''),
    );
    ws.on('error', () => onDrop(1006, 'socket error'));
  }

  private async reconnectLoop(): Promise<void> {
    if (this.terminal || this.closing) return;
    const deadline = Date.now() + this.maxElapsedMs;
    let attempt = 0;
    let delay = this.initialDelayMs;
    const reconnectAbortController = new AbortController();
    this.reconnectAbortController = reconnectAbortController;
    try {
      while (!this.terminal && !this.closing) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          this.failReconnect({
            attempts: attempt,
            cause: new Error('Reconnect deadline expired'),
          });
          return;
        }

        attempt++;
        this.onDebug?.({
          event: 'reconnect-attempt',
          attempt,
          lastSeenEventId: this._lastSeenEventId,
        });
        const abortController = new AbortController();
        this.activeConnectAbortController = abortController;
        const abortConnect = () =>
          abortController.abort(reconnectAbortController.signal.reason);
        reconnectAbortController.signal.addEventListener(
          'abort',
          abortConnect,
          {
            once: true,
          },
        );
        const timeout = setTimeout(() => {
          abortController.abort(new Error('Reconnect deadline expired'));
        }, remaining);
        (timeout as { unref?: () => void }).unref?.();

        try {
          const ws = await this.connect({
            abortSignal: abortController.signal,
          });
          if (this.terminal || this.closing) {
            closeWebSocket({ ws });
            return;
          }
          this.wire(ws);
          this.ws = ws;
          this.connected = true;
          // Ask the bridge to replay everything we have not seen, then flush any
          // host → bridge frames produced while we were disconnected.
          this.rawSend(
            JSON.stringify({
              type: 'resume',
              lastSeenEventId: this._lastSeenEventId,
            }),
          );
          this.flushPending();
          for (const handler of this.onReconnectHandlers) handler();
          this.onDebug?.({
            event: 'reconnected',
            attempt,
            lastSeenEventId: this._lastSeenEventId,
          });
          return;
        } catch (cause) {
          if (
            this.terminal ||
            this.closing ||
            reconnectAbortController.signal.aborted
          ) {
            return;
          }
          const remainingAfterFailure = deadline - Date.now();
          if (remainingAfterFailure <= 0) {
            this.failReconnect({ attempts: attempt, cause });
            return;
          }
          await sleep({
            ms: Math.min(delay, remainingAfterFailure),
            abortSignal: reconnectAbortController.signal,
          });
          delay = Math.min(delay * 1.5, this.maxDelayMs);
        } finally {
          clearTimeout(timeout);
          reconnectAbortController.signal.removeEventListener(
            'abort',
            abortConnect,
          );
          if (this.activeConnectAbortController === abortController) {
            this.activeConnectAbortController = undefined;
          }
        }
      }
    } finally {
      if (this.reconnectAbortController === reconnectAbortController) {
        this.reconnectAbortController = undefined;
      }
    }
  }

  private connect({
    abortSignal,
  }: SandboxChannelConnectOptions): Promise<WebSocket> {
    return awaitWebSocketConnection({
      connection: Promise.resolve().then(() =>
        this.connectThunk({ abortSignal }),
      ),
      abortSignal,
    });
  }

  private abortActiveConnect(): void {
    const controller = this.activeConnectAbortController;
    this.activeConnectAbortController = undefined;
    controller?.abort(new Error('SandboxChannel connection aborted'));
    this.reconnectAbortController?.abort(
      new Error('SandboxChannel connection aborted'),
    );
  }

  private failReconnect({
    attempts,
    cause,
  }: {
    attempts: number;
    cause: unknown;
  }): void {
    this.finalizeClose(1006, 'reconnect failed');
    this.onDebug?.({
      event: 'reconnect-failed',
      attempts,
      lastSeenEventId: this._lastSeenEventId,
      cause,
    });
  }

  private rawSend(text: string): void {
    if (this.connected && this.ws) {
      this.ws.send(text);
    } else {
      this.pendingSends.push(text);
    }
  }

  private flushPending(): void {
    if (!this.connected || !this.ws) return;
    const queued = this.pendingSends.splice(0);
    for (const text of queued) this.ws.send(text);
  }

  private enqueue(work: () => void | Promise<void>): void {
    this.dispatchChain = this.dispatchChain.then(work);
  }

  private async handleIncoming(text: string): Promise<void> {
    const raw = await safeParseJSON({ text });
    let seq: number | undefined;
    if (
      raw.success &&
      raw.value != null &&
      typeof raw.value === 'object' &&
      typeof (raw.value as { seq?: unknown }).seq === 'number'
    ) {
      seq = (raw.value as { seq: number }).seq;
    }

    const validated = await safeValidateTypes({
      value: raw.success ? raw.value : undefined,
      schema: this.outboundSchema,
    });
    if (validated.success) {
      if (seq !== undefined) {
        this.attachEventCheckpoint({ event: validated.value, eventId: seq });
      }
      this.dispatch(validated.value);
    } else {
      this.dispatch({
        type: 'error',
        error: validated.error,
      } as unknown as TOut);
    }

    if (seq !== undefined && seq > this._lastSeenEventId) {
      this._lastSeenEventId = seq;
    }
  }

  private dispatch(message: TOut): void {
    // Diagnostics are routed to their own sink and never enter the
    // per-type listener/buffer path, so they stay off the consumer stream.
    if (message.type === 'sandbox-log' || message.type === 'debug-event') {
      this.onDiagnostic?.(
        message as Extract<TOut, { type: 'sandbox-log' | 'debug-event' }>,
      );
      return;
    }
    if (message.type === 'error') {
      this.onBridgeError?.(message as Extract<TOut, { type: 'error' }>);
    }
    const type = message.type as EventTypeOf<TOut>;
    const set = this.listeners.get(type);
    if (this.bufferedOffset < this.buffered.length || !set || set.size === 0) {
      this.buffered.push(message);
      this.flushBuffered();
      this.scheduleSelectiveBufferedFlush();
      return;
    }
    for (const listener of set) {
      listener(message as Extract<TOut, { type: EventTypeOf<TOut> }>);
    }
  }

  private flushBuffered({
    selective = false,
  }: { selective?: boolean } = {}): void {
    if (this.flushingBuffered) return;
    this.flushingBuffered = true;
    try {
      while (this.bufferedOffset < this.buffered.length) {
        const message = this.buffered[this.bufferedOffset];
        const type = message.type as EventTypeOf<TOut>;
        const set = this.listeners.get(type);
        if (!set || set.size === 0) {
          if (!selective) return;
          this.bufferedOffset++;
          const buffered = this.bufferedByType.get(type);
          if (buffered) {
            buffered.push(message);
          } else {
            this.bufferedByType.set(type, [message]);
          }
          continue;
        }

        this.bufferedOffset++;
        for (const listener of set) {
          listener(message as Extract<TOut, { type: EventTypeOf<TOut> }>);
        }
      }
    } finally {
      if (this.bufferedOffset > 0) {
        this.buffered.splice(0, this.bufferedOffset);
        this.bufferedOffset = 0;
      }
      this.flushingBuffered = false;
    }
  }

  private flushBufferedType(type: EventTypeOf<TOut>): void {
    const buffered = this.bufferedByType.get(type);
    if (!buffered) return;

    let offset = 0;
    try {
      while (offset < buffered.length) {
        const set = this.listeners.get(type);
        if (!set || set.size === 0) return;

        const message = buffered[offset++];
        for (const listener of set) {
          listener(message as Extract<TOut, { type: EventTypeOf<TOut> }>);
        }
      }
    } finally {
      if (offset === buffered.length) {
        this.bufferedByType.delete(type);
      } else if (offset > 0) {
        buffered.splice(0, offset);
      }
    }
  }

  private scheduleSelectiveBufferedFlush(): void {
    if (
      this.bufferedFlushScheduled ||
      this.bufferedOffset >= this.buffered.length ||
      !this.hasListeners()
    ) {
      return;
    }

    this.bufferedFlushScheduled = true;
    queueMicrotask(() => {
      this.bufferedFlushScheduled = false;
      this.flushBuffered({ selective: true });
    });
  }

  private hasListeners(): boolean {
    for (const listeners of this.listeners.values()) {
      if (listeners.size > 0) return true;
    }
    return false;
  }

  private attachEventCheckpoint(options: {
    event: TOut;
    eventId: number;
  }): void {
    if (!Object.isExtensible(options.event)) return;
    Object.defineProperty(options.event, sandboxChannelEventCheckpointSymbol, {
      value: {
        pin: () => {
          const token = {};
          this.pinnedSuspensionCursor = { eventId: options.eventId, token };
          return () => {
            if (this.pinnedSuspensionCursor?.token === token) {
              this.pinnedSuspensionCursor = undefined;
            }
          };
        },
      } satisfies SandboxChannelEventCheckpoint,
    });
  }

  private finalizeClose(code: number, reason: string): void {
    if (this.terminal) return;
    this.abortActiveConnect();
    this.terminal = true;
    this.connected = false;
    for (const h of this.onCloseHandlers) h(code, reason);
  }
}
