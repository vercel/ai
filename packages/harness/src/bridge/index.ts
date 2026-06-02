// Shared in-sandbox bridge runtime. Adapter `bridge.mjs` bundles re-bundle
// this module (tsup inlines it; `ws` stays external and resolves from the
// sandbox-installed node_modules). It owns everything generic to the bridge
// transport — the WebSocket server, token auth, single-flight connection
// replacement, the in-memory event log + monotonic `seq`, resume replay, and
// the lifecycle/meta files. The adapter supplies only `onStart` (drive its
// CLI/SDK and translate to wire events) and `onDetach` (its resume payload).

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { env as procEnv, pid, stdout } from 'node:process';
import { WebSocketServer, type WebSocket } from 'ws';

export type BridgeState = 'init' | 'waiting' | 'running' | 'draining' | 'done';

/** Outbound turn event the adapter emits. `seq` is added by the runtime. */
export type BridgeEvent = Record<string, unknown> & { type: string };

/**
 * Per-turn surface handed to {@link RunBridgeOptions.onStart}. The adapter
 * drives its runtime against these primitives; the runtime owns the transport.
 */
export interface BridgeTurn {
  /**
   * Emit a turn event to the host. Stamps a monotonic `seq`, appends to the
   * in-memory replay log, and sends to the live socket (best-effort — if the
   * host is mid-reconnect the event waits in the log and is replayed on
   * resume).
   */
  emit(event: BridgeEvent): void;

  /**
   * Register interest in a host-executed tool result and resolve when the
   * matching `tool-result` arrives. The adapter emits the `tool-call` event
   * itself (via {@link emit}) using the same `toolCallId`.
   */
  requestToolResult(
    toolCallId: string,
  ): Promise<{ output: unknown; isError?: boolean }>;

  /**
   * Live queue of mid-turn user messages. The runtime pushes inbound
   * `user-message` text here; the adapter drains it as its runtime accepts
   * interactive input.
   */
  readonly pendingUserMessages: string[];

  /** Aborts when the host sends `abort`. */
  readonly abortSignal: AbortSignal;

  /** True for the first turn since this bridge process started. */
  readonly firstTurn: boolean;
}

export interface RunBridgeOptions<TStart extends { type: 'start' }> {
  /** Identifier written into `bridge-meta.json` (`'claude-code'` / `'codex'`). */
  bridgeType: string;
  /** Directory for `bridge-meta.json` / `start-config.json`. Created if absent. */
  bridgeStateDir: string;
  /** Drive one prompt turn. Rejections surface to the host as an `error` event. */
  onStart(start: TStart, turn: BridgeTurn): Promise<void>;
  /** Produce the adapter-defined resume payload for a `detach`. Defaults to `{}`. */
  onDetach?(): unknown | Promise<unknown>;
  /** WS port. Defaults to `BRIDGE_WS_PORT` env (0 = OS-assigned). */
  port?: number;
  /** Auth token. Defaults to `BRIDGE_CHANNEL_TOKEN` env. */
  token?: string;
  /** Called with the bound port once the server is listening. */
  onListening?(port: number): void;
  /**
   * Tear the process down after a `shutdown` / `detach`. Defaults to closing
   * the server and calling `process.exit(0)`. Overridable for tests.
   */
  onExit?(): void;
}

type InboundControl =
  | {
      type: 'tool-result';
      toolCallId: string;
      output: unknown;
      isError?: boolean;
    }
  | { type: 'user-message'; text: string }
  | { type: 'abort' }
  | { type: 'shutdown' }
  | { type: 'detach' }
  | { type: 'resume'; lastSeenEventId: number };

const WS_OPEN = 1;

/**
 * Boot the bridge: bind the WebSocket server, announce `bridge-ready`, and
 * service host connections for the lifetime of the process. Resolves once the
 * server is listening; the process then stays alive on the server until a
 * `shutdown` / `detach` exits it.
 */
export interface BridgeHandle {
  /** The port the WebSocket server bound to. */
  readonly port: number;
  /** Close the WebSocket server. Does not call `process.exit`. */
  close(): Promise<void>;
}

export async function runBridge<TStart extends { type: 'start' }>(
  options: RunBridgeOptions<TStart>,
): Promise<BridgeHandle> {
  const { bridgeType, bridgeStateDir, onStart, onDetach } = options;
  const expectedToken = options.token ?? procEnv.BRIDGE_CHANNEL_TOKEN ?? '';
  const bridgeWsPort =
    options.port ?? parseInt(procEnv.BRIDGE_WS_PORT ?? '0', 10);

  const bridgeMetaPath = `${bridgeStateDir}/bridge-meta.json`;
  const startConfigPath = `${bridgeStateDir}/start-config.json`;
  const rerunStartConfigPath = `${bridgeStateDir}/rerun-start-config.json`;
  const eventLogPath = `${bridgeStateDir}/event-log.ndjson`;

  try {
    await mkdir(bridgeStateDir, { recursive: true });
  } catch {
    // Best-effort; the bridge still runs without its state files.
  }

  // ─── mutable runtime state ──────────────────────────────────────────
  let currentBoundPort = 0;
  let currentTurnState: BridgeState = 'init';
  let activeSocket: WebSocket | undefined;
  let isFirstTurn = true;
  let turnAbort: AbortController | undefined;
  let currentUserMessages: string[] | undefined;

  // Replay log. `seq` is monotonic across the whole process — never reset —
  // because the host's `SandboxChannel` cursor (`lastSeenEventId`) lives across
  // turns. The log *contents* are cleared at the start of each turn to bound
  // memory; the just-finished turn stays replayable until the next `start`.
  let seqCounter = 0;
  let eventLog: Array<{ seq: number; line: string }> = [];

  /*
   * Disk mirror of the in-memory replay log. The in-memory log is lost when the
   * bridge process dies; the on-disk `event-log.ndjson` survives in the sandbox
   * filesystem so a respawned bridge (started with `BRIDGE_REPLAY_FROM_DISK=1`)
   * can reload the just-interrupted turn and serve a host's resume cursor —
   * `replay` recovery. Writes are batched on `setImmediate` (single-flight via
   * `flushPromise`) to keep `emit` off the disk hot path.
   */
  let diskBuffer = '';
  let flushPromise: Promise<void> | null = null;

  const flushEventsToDisk = async (): Promise<void> => {
    while (diskBuffer.length > 0) {
      const buf = diskBuffer;
      diskBuffer = '';
      await appendFile(eventLogPath, buf).catch(() => {
        // Best-effort crash-recovery mirror; the in-memory log is the source of
        // truth for the live connection.
      });
    }
  };

  const scheduleEventFlush = (): void => {
    if (flushPromise) return;
    flushPromise = new Promise<void>(resolve => {
      setImmediate(() => {
        void flushEventsToDisk().finally(resolve);
      });
    }).finally(() => {
      flushPromise = null;
      if (diskBuffer.length > 0) {
        scheduleEventFlush();
      }
    });
  };

  const flushPendingEventsToDisk = async (): Promise<void> => {
    if (diskBuffer.length > 0 && !flushPromise) {
      scheduleEventFlush();
    }
    // Await each in-flight flush, re-reading `flushPromise` after every await
    // since a fresh flush may have been scheduled for buffer that arrived while
    // we waited.
    let inFlight = flushPromise;
    while (inFlight) {
      await inFlight;
      inFlight = flushPromise;
    }
  };

  /*
   * When respawned for `replay`, reload the previous turn's log from disk before
   * accepting any connection so the very first `resume{lastSeenEventId}` can be
   * served the tail (including the terminal `finish`). The seq counter is
   * restored to the last persisted seq so it stays aligned with the host's
   * long-lived cursor. The file is NOT truncated in this mode — only a fresh
   * `start` (next turn) clears it.
   */
  const replayFromDisk = procEnv.BRIDGE_REPLAY_FROM_DISK === '1';
  if (replayFromDisk && existsSync(eventLogPath)) {
    try {
      const lines = readFileSync(eventLogPath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      eventLog = lines.map(line => ({
        seq: (JSON.parse(line) as { seq: number }).seq,
        line,
      }));
      seqCounter = eventLog.at(-1)?.seq ?? 0;
    } catch {
      // Corrupt/partial log: fall back to an empty log; the host then degrades
      // to `rerun` instead of replaying a malformed tail.
      eventLog = [];
      seqCounter = 0;
    }
  }

  const pendingToolResults = new Map<
    string,
    (output: { output: unknown; isError?: boolean }) => void
  >();

  // ─── persistence (best-effort meta + start config) ──────────────────
  const writeBridgeMeta = async (state: BridgeState): Promise<void> => {
    try {
      await writeFile(
        bridgeMetaPath,
        JSON.stringify({
          type: bridgeType,
          port: currentBoundPort,
          state,
          pid,
        }),
      );
    } catch {
      // Best-effort resilience metadata; not load-bearing for the active turn.
    }
  };

  const writeStartConfig = async (start: unknown): Promise<void> => {
    try {
      const serialized = JSON.stringify(start);
      await writeFile(startConfigPath, serialized);
      // Frozen copy: written once, restored over start-config.json by future
      // rerun-mode recovery to re-run the original turn from scratch.
      if (!existsSync(rerunStartConfigPath)) {
        await writeFile(rerunStartConfigPath, serialized);
      }
    } catch {
      // Best-effort.
    }
  };

  // ─── wire send + replay ─────────────────────────────────────────────
  const sendControl = (msg: Record<string, unknown>): void => {
    if (activeSocket?.readyState === WS_OPEN) {
      try {
        activeSocket.send(JSON.stringify(msg));
      } catch {
        // best-effort
      }
    }
  };

  const emit = (event: BridgeEvent): void => {
    const seq = ++seqCounter;
    const line = JSON.stringify({ ...event, seq });
    eventLog.push({ seq, line });
    diskBuffer += `${line}\n`;
    scheduleEventFlush();
    if (activeSocket?.readyState === WS_OPEN) {
      try {
        activeSocket.send(line);
      } catch {
        // Send is best-effort: a dropped socket leaves the event in the log,
        // replayed once the host reconnects and sends `resume`.
      }
    }
  };

  const replay = (ws: WebSocket, afterSeq: number): void => {
    for (const entry of eventLog) {
      if (entry.seq > afterSeq && ws.readyState === WS_OPEN) {
        ws.send(entry.line);
      }
    }
  };

  // ─── inbound routing ────────────────────────────────────────────────
  const handleInbound = async (
    msg: TStart | InboundControl,
    ws: WebSocket,
  ): Promise<void> => {
    switch (msg.type) {
      case 'start': {
        const firstTurn = isFirstTurn;
        isFirstTurn = false;
        eventLog = []; // clear previous turn; keep seqCounter monotonic
        // Mirror the in-memory clear to disk: the log tracks only the current
        // turn. Discard any unflushed tail from the prior turn first.
        diskBuffer = '';
        void writeFile(eventLogPath, '').catch(() => {});
        turnAbort = new AbortController();
        currentTurnState = 'running';
        void writeStartConfig(msg);
        void writeBridgeMeta('running');
        const turn: BridgeTurn = {
          emit,
          requestToolResult: toolCallId =>
            new Promise(resolve => {
              pendingToolResults.set(toolCallId, resolve);
            }),
          pendingUserMessages: [],
          abortSignal: turnAbort.signal,
          firstTurn,
        };
        currentUserMessages = turn.pendingUserMessages;
        try {
          await onStart(msg as TStart, turn);
        } catch (err) {
          emit({ type: 'error', error: serialiseError(err) });
        } finally {
          currentTurnState = 'waiting';
          void writeBridgeMeta('waiting');
        }
        return;
      }
      case 'tool-result': {
        const resolver = pendingToolResults.get(msg.toolCallId);
        if (resolver) {
          pendingToolResults.delete(msg.toolCallId);
          resolver({ output: msg.output, isError: msg.isError });
        }
        return;
      }
      case 'user-message':
        currentUserMessages?.push(msg.text);
        return;
      case 'abort':
        turnAbort?.abort();
        return;
      case 'resume':
        replay(ws, msg.lastSeenEventId);
        return;
      case 'shutdown':
        currentTurnState = 'done';
        void writeBridgeMeta('done');
        drainThenExit(ws, 1000, 'shutdown');
        return;
      case 'detach': {
        currentTurnState = 'done';
        void writeBridgeMeta('done');
        const data = (await onDetach?.()) ?? {};
        sendControl({ type: 'bridge-detach', data });
        drainThenExit(ws, 1000, 'detach');
        return;
      }
    }
  };

  // ─── server ─────────────────────────────────────────────────────────
  void writeBridgeMeta('init');

  const wss = new WebSocketServer({ port: bridgeWsPort, host: '0.0.0.0' });

  const exit = (): void => {
    if (options.onExit) {
      options.onExit();
      return;
    }
    wss.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };

  const drainThenExit = (ws: WebSocket, code: number, reason: string): void => {
    const start = Date.now();
    const tick = (): void => {
      const drained = ws.bufferedAmount === 0 || ws.readyState !== WS_OPEN;
      if (drained || Date.now() - start >= 5_000) {
        // Flush the on-disk log so a clean shutdown/detach leaves a complete
        // event-log.ndjson for any later replay recovery.
        void flushPendingEventsToDisk().finally(() => {
          try {
            ws.close(code, reason);
          } finally {
            exit();
          }
        });
        return;
      }
      setTimeout(tick, 10).unref();
    };
    tick();
  };

  wss.on('listening', () => {
    const addr = wss.address();
    currentBoundPort = typeof addr === 'object' && addr ? addr.port : 0;
    currentTurnState = 'waiting';
    void writeBridgeMeta('waiting');
    stdout.write(
      JSON.stringify({
        type: 'bridge-ready',
        port: currentBoundPort,
      }) + '\n',
    );
    options.onListening?.(currentBoundPort);
  });

  wss.on('connection', (ws: WebSocket, req: { url?: string }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.searchParams.get('agent_bridge_token') !== expectedToken) {
      ws.close(1008, 'unauthorized');
      return;
    }

    // Single-flight: a fresh authorized connection *replaces* the active one
    // (the host reconnecting after a drop). The previous socket's close is a
    // no-op below because it is no longer `activeSocket`.
    activeSocket = ws;

    // Announce liveness the instant we accept. Some sandbox runtimes complete
    // the host-side WS handshake before the connection is forwarded here; the
    // host waits for this frame before sending `start`/`resume`.
    sendControl({
      type: 'bridge-hello',
      state: currentTurnState,
      lastSeq: seqCounter,
    });

    ws.on('message', (raw: ArrayBufferLike | string) => {
      let parsed: TStart | InboundControl;
      try {
        const text =
          typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
        parsed = JSON.parse(text) as TStart | InboundControl;
      } catch (err) {
        sendControl({
          type: 'error',
          error: `protocol parse error: ${(err as Error).message}`,
        });
        return;
      }
      void handleInbound(parsed, ws);
    });

    ws.on('close', () => {
      // Only the *current* socket's close matters. A stale socket (already
      // replaced by a reconnect) closing is a no-op. Crucially we do NOT abort
      // the in-flight turn — it keeps running and its events accumulate in the
      // log for replay when the host reconnects.
      if (activeSocket === ws) {
        activeSocket = undefined;
      }
    });

    ws.on('error', () => {
      // 'close' follows; nothing to do beyond keeping the process alive.
    });
  });

  // Surface bridge-internal crashes to the host instead of dying silently.
  process.on('uncaughtException', err => {
    emit({ type: 'error', error: serialiseError(err) });
  });
  process.on('unhandledRejection', err => {
    emit({ type: 'error', error: serialiseError(err) });
  });

  await new Promise<void>(resolve => {
    if (wss.address() != null) {
      resolve();
      return;
    }
    wss.on('listening', () => resolve());
  });

  return {
    port: currentBoundPort,
    close: () =>
      new Promise<void>(resolve => {
        wss.close(() => resolve());
      }),
  };
}

function serialiseError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}
