import {
  safeParseJSON,
  safeValidateTypes,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import type { WebSocket } from 'ws';

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
  /** Give up reconnecting after this many milliseconds. Default 30_000. */
  readonly maxElapsedMs?: number;
  /** First backoff delay. Default 50. */
  readonly initialDelayMs?: number;
  /** Backoff ceiling. Default 2_000. */
  readonly maxDelayMs?: number;
}

export interface SandboxChannelOptions<TOut> {
  /**
   * Open a fresh WebSocket to the bridge and resolve once it is ready to carry
   * frames (i.e. after any adapter-specific handshake such as Claude Code's
   * `bridge-hello`). Called once by {@link SandboxChannel.open} and again on
   * every transient reconnect. Must reject if the connection cannot be
   * established.
   */
  connect: () => Promise<WebSocket>;

  /** Schema validating inbound (bridge → host) frames. */
  outboundSchema: FlexibleSchema<TOut>;

  reconnect?: SandboxChannelReconnectOptions;

  onDebug?: (event: SandboxChannelDebugEvent) => void;
}

type EventTypeOf<TOut extends { type: string }> = TOut['type'];

type Listener<TOut extends { type: string }, T extends EventTypeOf<TOut>> = (
  event: Extract<TOut, { type: T }>,
) => void;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    (t as { unref?: () => void }).unref?.();
  });

/**
 * Host-side typed wrapper around the bridge WebSocket connection.
 *
 * Buffers inbound messages until a listener for their type is registered, so
 * callers that subscribe asynchronously do not miss early frames. Inbound
 * dispatch is serialised through a promise chain so a `close` event that
 * arrives on the same microtask as the final `finish` message does not fire
 * close handlers until the message has been dispatched.
 *
 * Survives transient disconnects (§9). The bridge keeps running and
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
  private readonly buffered = new Map<EventTypeOf<TOut>, TOut[]>();
  private readonly onCloseHandlers = new Set<
    (code: number, reason: string) => void
  >();

  private readonly connectThunk: () => Promise<WebSocket>;
  private readonly outboundSchema: FlexibleSchema<TOut>;
  private readonly onDebug:
    | ((event: SandboxChannelDebugEvent) => void)
    | undefined;
  private readonly maxElapsedMs: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  private ws: WebSocket | undefined;
  private connected = false;
  /** Host has begun teardown; suppresses reconnect so a bridge-side close finalises. */
  private closing = false;
  /** Channel is fully torn down; `send` throws and `onClose` has fired. */
  private terminal = false;
  private lastSeenEventId = 0;
  private readonly pendingSends: string[] = [];
  private dispatchChain: Promise<void> = Promise.resolve();

  constructor(options: SandboxChannelOptions<TOut>) {
    this.connectThunk = options.connect;
    this.outboundSchema = options.outboundSchema;
    this.onDebug = options.onDebug;
    this.maxElapsedMs = options.reconnect?.maxElapsedMs ?? 30_000;
    this.initialDelayMs = options.reconnect?.initialDelayMs ?? 50;
    this.maxDelayMs = options.reconnect?.maxDelayMs ?? 2_000;
  }

  /**
   * Establish the initial connection. A single attempt — startup failures
   * reject so the caller can fail `doStart` cleanly. Reconnect retries apply
   * only to drops after a successful open.
   */
  async open(): Promise<void> {
    if (this.terminal) {
      throw new Error('SandboxChannel: cannot open a closed channel.');
    }
    const ws = await this.connectThunk();
    this.wire(ws);
    this.ws = ws;
    this.connected = true;
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

    const buffered = this.buffered.get(type);
    if (buffered) {
      this.buffered.delete(type);
      for (const event of buffered) {
        listener(event as Extract<TOut, { type: T }>);
      }
    }

    return () => {
      set!.delete(listener as unknown as Listener<TOut, EventTypeOf<TOut>>);
    };
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.onCloseHandlers.add(handler);
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
   * sending a `shutdown` / `detach` message whose ack the bridge follows with a
   * socket close.
   */
  beginClose(): void {
    this.closing = true;
  }

  close(): void {
    if (this.terminal) return;
    this.closing = true;
    try {
      this.ws?.close();
    } catch {
      // best-effort
    }
    this.enqueue(() => this.finalizeClose(1000, 'closed'));
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
    const start = Date.now();
    let attempt = 0;
    let delay = this.initialDelayMs;
    while (!this.terminal && !this.closing) {
      attempt++;
      this.onDebug?.({
        event: 'reconnect-attempt',
        attempt,
        lastSeenEventId: this.lastSeenEventId,
      });
      try {
        const ws = await this.connectThunk();
        if (this.terminal || this.closing) {
          try {
            ws.close();
          } catch {
            // best-effort
          }
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
            lastSeenEventId: this.lastSeenEventId,
          }),
        );
        this.flushPending();
        this.onDebug?.({
          event: 'reconnected',
          attempt,
          lastSeenEventId: this.lastSeenEventId,
        });
        return;
      } catch (cause) {
        if (Date.now() - start >= this.maxElapsedMs) {
          this.finalizeClose(1006, 'reconnect failed');
          this.onDebug?.({
            event: 'reconnect-failed',
            attempts: attempt,
            lastSeenEventId: this.lastSeenEventId,
            cause,
          });
          return;
        }
        await sleep(delay);
        delay = Math.min(delay * 1.5, this.maxDelayMs);
      }
    }
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
      this.dispatch(validated.value);
    } else {
      this.dispatch({
        type: 'error',
        error: validated.error,
      } as unknown as TOut);
    }

    if (seq !== undefined && seq > this.lastSeenEventId) {
      this.lastSeenEventId = seq;
    }
  }

  private dispatch(message: TOut): void {
    const type = message.type as EventTypeOf<TOut>;
    const set = this.listeners.get(type);
    if (!set || set.size === 0) {
      let bucket = this.buffered.get(type);
      if (!bucket) {
        bucket = [];
        this.buffered.set(type, bucket);
      }
      bucket.push(message);
      return;
    }
    for (const listener of set) {
      listener(message as Extract<TOut, { type: EventTypeOf<TOut> }>);
    }
  }

  private finalizeClose(code: number, reason: string): void {
    if (this.terminal) return;
    this.terminal = true;
    this.connected = false;
    for (const h of this.onCloseHandlers) h(code, reason);
  }
}
