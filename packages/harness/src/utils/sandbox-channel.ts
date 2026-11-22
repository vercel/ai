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

  /**
   * Why the channel is connecting: `'open'` for the initial
   * {@link SandboxChannel.open} call, `'reconnect'` for an attempt to recover
   * from a transient disconnect.
   */
  readonly reason: 'open' | 'reconnect';
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

  /**
   * Interval between WebSocket pings in milliseconds. Keeps idle connections
   * alive and terminates an unresponsive socket after two unanswered pings so
   * reconnection can begin. Inbound progress counts as a response too: a peer
   * that is still sending a large frame has not died just because its pong is
   * queued behind that frame. Default 20_000. Set to 0 to disable. Sockets
   * without ping support are left unchanged.
   */
  keepAliveMs?: number;

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

type BufferedEvent<TOut extends { type: string }> = {
  message: TOut;
  listeners?: ReadonlyArray<Listener<TOut, EventTypeOf<TOut>>>;
};

type PendingSend = {
  text: string;
  onSent?: () => void;
};

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

/*
 * Give up after this many consecutive heartbeat timeouts on connections that
 * never proved the peer alive and delivered no event: each reconnect would only
 * replay the same unread frame, so the loop has to end. External close/error
 * drops are not heartbeat timeouts and do not count.
 */
const maxStalledReconnects = 3;

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

/**
 * Number of bytes the underlying transport has received on this socket, when
 * the implementation exposes a byte counter. The `ws` package exposes the Node
 * socket as `_socket`; browser-like implementations do not, in which case
 * callers fall back to counting completed frames.
 */
function getReceivedByteCount(ws: WebSocket): number | undefined {
  const socket = (ws as WebSocket & { _socket?: { bytesRead?: unknown } })
    ._socket;
  const bytesRead = socket?.bytesRead;
  return typeof bytesRead === 'number' && Number.isFinite(bytesRead)
    ? bytesRead
    : undefined;
}

/**
 * A frame larger than the receiver's `maxPayload` is rejected before the cursor
 * can advance, so reconnecting would only download and reject the same frame
 * again. `ws` reports this as an unsupported message length (close code 1009);
 * other implementations surface a generic error and keep retrying.
 */
function getOversizedMessageError(error: unknown): Error | undefined {
  if (!(error instanceof Error)) return undefined;
  return (error as { code?: unknown }).code ===
    'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
    ? error
    : undefined;
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
 * do not miss or reorder early frames. Listener registration drains the
 * ordered prefix synchronously. Selective listeners are given through the
 * current task (including its microtasks) to attach before unhandled event
 * types are retained independently, so they cannot block subscribed event
 * types indefinitely. A listener that claims an already-buffered event still
 * receives it if it unsubscribes before that ordered drain completes. Use
 * {@link SandboxChannel.beginListenerAttachment} to define an explicit
 * attachment boundary that spans asynchronous work. Inbound dispatch is
 * serialised through a promise chain so a `close` event that arrives on the
 * same microtask as the final `finish` message does not fire close handlers
 * until the message has been dispatched.
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
  private readonly buffered: BufferedEvent<TOut>[] = [];
  private readonly bufferedByType = new Map<EventTypeOf<TOut>, TOut[]>();
  private bufferedOffset = 0;
  private flushingBuffered = false;
  private bufferedFlushScheduled = false;
  private listenerAttachmentDepth = 0;
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

  private readonly keepAliveMs: number;
  private stopKeepalive: (() => void) | undefined;

  /**
   * The current (or most recently dropped) connection has proven the peer
   * alive: it answered a ping or delivered a complete inbound frame. Inbound
   * bytes alone keep the connection alive against the heartbeat but do not
   * reset the stalled-reconnect count.
   */
  private connectionProvenAlive = false;
  /**
   * Consecutive heartbeat-timeout drops on connections that never proved the
   * peer alive and delivered no event. External close/error drops do not count
   * and reset the streak.
   */
  private stalledReconnects = 0;
  private reconnectStallCursor: number | undefined;

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
  private readonly pendingSends: PendingSend[] = [];
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
    this.keepAliveMs = options.keepAliveMs ?? 20_000;
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
        reason: 'open',
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

    this.captureBufferedListeners(type);
    if (this.listenerAttachmentDepth > 0) {
      return () => {
        set!.delete(listener as unknown as Listener<TOut, EventTypeOf<TOut>>);
      };
    }

    this.flushBufferedType(type);
    this.flushBuffered();
    this.scheduleSelectiveBufferedFlush();

    return () => {
      set!.delete(listener as unknown as Listener<TOut, EventTypeOf<TOut>>);
    };
  }

  /**
   * Hold buffered event delivery while a consumer attaches a related set of
   * listeners, including across asynchronous boundaries. Call the returned
   * function once registration is complete. Buffered events are then replayed
   * in arrival order; event types that remain unhandled are retained
   * independently so they do not block subscribed types.
   */
  beginListenerAttachment(): () => void {
    this.listenerAttachmentDepth++;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.listenerAttachmentDepth--;
      if (this.listenerAttachmentDepth > 0) return;

      for (const type of this.listeners.keys()) {
        this.flushBufferedType(type);
      }
      this.flushBuffered();
      this.scheduleSelectiveBufferedFlush();
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

  /**
   * Queue a frame if disconnected. `onSent` runs in a microtask after the frame
   * is handed to the socket, not after bridge acknowledgement. Reconnect
   * handlers run before notifications for frames flushed on that connection.
   * Set `queueIfDisconnected` to false when the caller owns reconnect replay;
   * an unsent frame is then discarded and its `onSent` callback never runs.
   */
  send(
    message: TIn,
    {
      onSent,
      queueIfDisconnected = true,
    }: { onSent?: () => void; queueIfDisconnected?: boolean } = {},
  ): void {
    if (this.terminal) {
      throw new Error(
        `SandboxChannel: cannot send ${message.type} — channel is closed.`,
      );
    }
    this.rawSend(JSON.stringify(message), onSent, queueIfDisconnected);
  }

  /**
   * Mark that the host is tearing the session down. The next socket close is
   * then treated as terminal rather than triggering a reconnect. Call before
   * sending a `stop` / `destroy` message whose completion closes the bridge
   * socket.
   */
  beginClose(): void {
    this.closing = true;
    this.stopKeepalive?.();
    this.abortActiveConnect();
  }

  close(): void {
    if (this.terminal) return;
    this.beginClose();
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
      this.beginClose();
      this.onClose(() =>
        resolve(pinnedSuspensionCursor ?? this._lastSeenEventId),
      );
      // Queue the close behind any already-dispatched frames so everything
      // delivered to the consumer is reflected in the final cursor.
      this.enqueue(() => {
        try {
          // The bridge reads this reason to keep a suspended turn running
          // instead of treating the close as a host that disconnected:
          this.ws?.close(1000, 'suspended');
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
    this.connectionProvenAlive = false;
    let inboundFrames = 0;
    const markAlive = () => {
      this.connectionProvenAlive = true;
    };
    let heartbeatTimedOut = false;
    let oversizedMessage: Error | undefined;
    const onDrop = (code: number, reason: string) => {
      if (dropped) return;
      dropped = true;
      stopKeepalive();
      if (ws !== this.ws) return;
      this.connected = false;
      if (this.closing) {
        this.enqueue(() => this.finalizeClose(code, reason));
      } else {
        this.enqueue(() =>
          this.reconnectLoop({
            heartbeatTimeout: heartbeatTimedOut,
            nonRetryableCause: oversizedMessage,
          }),
        );
      }
    };

    const stopKeepalive = this.keepalive(
      ws,
      () => {
        // Set before closing: some implementations emit `close` synchronously
        // from `terminate()`, and the classification must not depend on that.
        heartbeatTimedOut = true;
        closeWebSocket({ ws });
        onDrop(1006, 'heartbeat timeout');
      },
      markAlive,
      () => inboundFrames,
    );
    this.stopKeepalive = stopKeepalive;

    ws.on('message', (raw: ArrayBufferLike | string) => {
      // Once suspended, ignore further frames so the cursor freezes exactly at
      // the last delivered event (the bridge replays the rest to the next slice).
      if (this.suspended) return;
      inboundFrames++;
      markAlive();
      const text =
        typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
      this.enqueue(() => this.handleIncoming(text));
    });
    ws.on('close', (code: number, reason: Buffer) =>
      onDrop(code, reason?.toString?.('utf8') ?? ''),
    );
    ws.on('error', (error: unknown) => {
      // Read inside the queued reconnect: the receiver may emit `close` before
      // `error`, and the loop must still see the classification.
      oversizedMessage ??= getOversizedMessageError(error);
      onDrop(1006, 'socket error');
    });
  }

  private keepalive(
    ws: WebSocket,
    onTimeout: () => void,
    onLiveness: () => void,
    inboundFrameCount: () => number,
  ): () => void {
    if (!(this.keepAliveMs > 0) || typeof ws.ping !== 'function') {
      return () => {};
    }
    let unansweredPings = 0;
    let lastReceivedBytes = getReceivedByteCount(ws);
    let lastInboundFrames = inboundFrameCount();
    /*
     * A pong is not the only proof of life: on a slow link the peer's pong
     * queues behind a large frame that is still being received (head-of-line
     * blocking), so a transfer that keeps making progress must not be treated
     * as a dead peer. Any inbound bytes or completed frames since the previous
     * interval reset the ping count. Only completed frames and pongs mark the
     * connection alive for the reconnect bound: bytes alone can arrive from a
     * frame a middlebox keeps cutting, which must not defeat the bound.
     * Implementations that expose neither counter keep the pong-only behavior.
     */
    const hasInboundProgress = (): boolean => {
      let progressed = false;
      const receivedBytes = getReceivedByteCount(ws);
      if (receivedBytes !== undefined) {
        if (
          lastReceivedBytes !== undefined &&
          receivedBytes > lastReceivedBytes
        ) {
          progressed = true;
        }
        lastReceivedBytes = receivedBytes;
      }
      const receivedFrames = inboundFrameCount();
      if (receivedFrames > lastInboundFrames) {
        progressed = true;
      }
      lastInboundFrames = receivedFrames;
      return progressed;
    };
    const onPong = () => {
      unansweredPings = 0;
      onLiveness();
    };
    ws.on('pong', onPong);
    const timer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (hasInboundProgress()) {
        unansweredPings = 0;
      }
      if (unansweredPings >= 2) {
        onTimeout();
        return;
      }
      unansweredPings++;
      try {
        ws.ping();
      } catch {
        onTimeout();
      }
    }, this.keepAliveMs);
    (timer as { unref?: () => void }).unref?.();
    return () => {
      clearInterval(timer);
      ws.off('pong', onPong);
    };
  }

  private async reconnectLoop({
    heartbeatTimeout,
    nonRetryableCause,
  }: {
    heartbeatTimeout: boolean;
    nonRetryableCause?: Error;
  }): Promise<void> {
    if (this.terminal || this.closing) return;
    if (nonRetryableCause != null) {
      // The same unreadable frame would be replayed on every reconnect.
      this.failReconnect({ attempts: 0, cause: nonRetryableCause });
      return;
    }
    /*
     * Bound only our own heartbeat-driven loops. A connection that the
     * keep-alive killed without ever proving the peer alive and without
     * delivering an event is the signature of a peer replaying a frame the
     * other side cannot finish reading; after a few of those, give up instead
     * of replaying forever. External close/error drops always get a fresh
     * `maxElapsedMs` budget, as before, so an idle session behind a proxy that
     * cuts idle connections keeps reconnecting.
     */
    const cursorProgressed =
      this.reconnectStallCursor !== undefined &&
      this._lastSeenEventId !== this.reconnectStallCursor;
    if (heartbeatTimeout && !this.connectionProvenAlive && !cursorProgressed) {
      this.stalledReconnects++;
    } else {
      this.stalledReconnects = 0;
    }
    this.reconnectStallCursor = this._lastSeenEventId;
    if (this.stalledReconnects > maxStalledReconnects) {
      this.failReconnect({
        attempts: 0,
        cause: new Error(
          `Gave up reconnecting after ${this.stalledReconnects} heartbeat timeouts without event progress`,
        ),
      });
      return;
    }
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
            reason: 'reconnect',
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
    reason,
  }: SandboxChannelConnectOptions): Promise<WebSocket> {
    return awaitWebSocketConnection({
      connection: Promise.resolve().then(() =>
        this.connectThunk({ abortSignal, reason }),
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

  private rawSend(
    text: string,
    onSent?: () => void,
    queueIfDisconnected = true,
  ): void {
    if (this.connected && this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(text);
      if (onSent) queueMicrotask(onSent);
    } else if (queueIfDisconnected) {
      this.pendingSends.push({ text, onSent });
    }
  }

  private flushPending(): void {
    let sent = 0;
    try {
      while (
        sent < this.pendingSends.length &&
        this.connected &&
        this.ws &&
        this.ws.readyState === this.ws.OPEN
      ) {
        const { text, onSent } = this.pendingSends[sent];
        this.ws.send(text);
        sent++;
        if (onSent) queueMicrotask(onSent);
      }
    } finally {
      this.pendingSends.splice(0, sent);
    }
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
    if (
      this.listenerAttachmentDepth > 0 ||
      this.bufferedOffset < this.buffered.length ||
      !set ||
      set.size === 0
    ) {
      this.buffered.push({
        message,
        ...(set != null && set.size > 0 ? { listeners: Array.from(set) } : {}),
      });
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
    if (this.flushingBuffered || this.listenerAttachmentDepth > 0) return;
    this.flushingBuffered = true;
    try {
      while (this.bufferedOffset < this.buffered.length) {
        const bufferedEvent = this.buffered[this.bufferedOffset];
        const message = bufferedEvent.message;
        const type = message.type as EventTypeOf<TOut>;
        const set = this.listeners.get(type);
        const listeners =
          bufferedEvent.listeners ??
          (set != null && set.size > 0 ? Array.from(set) : undefined);
        if (!listeners || listeners.length === 0) {
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
        for (const listener of listeners) {
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

  private captureBufferedListeners(type: EventTypeOf<TOut>): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;

    for (let i = this.bufferedOffset; i < this.buffered.length; i++) {
      const bufferedEvent = this.buffered[i];
      if (
        bufferedEvent.listeners == null &&
        bufferedEvent.message.type === type
      ) {
        bufferedEvent.listeners = Array.from(set);
      }
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
      !this.hasListeners() ||
      this.listenerAttachmentDepth > 0
    ) {
      return;
    }

    this.bufferedFlushScheduled = true;
    setTimeout(() => {
      this.bufferedFlushScheduled = false;
      if (this.listenerAttachmentDepth > 0) return;
      this.flushBuffered({ selective: true });
    }, 0);
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
    this.stopKeepalive?.();
    this.abortActiveConnect();
    this.terminal = true;
    this.connected = false;
    for (const h of this.onCloseHandlers) h(code, reason);
  }
}
