// Shared in-sandbox bridge runtime. Adapter `bridge.mjs` bundles re-bundle
// this module (tsup inlines it; `ws` stays external and resolves from the
// sandbox-installed node_modules). It owns everything generic to the bridge
// transport — the WebSocket server, token auth, the in-memory event log +
// monotonic `seq`, resume replay, and the lifecycle/meta files. Any number of
// hosts may be connected; exactly one of them owns the event stream, and
// `start`/`resume` transfer that ownership. The adapter supplies only `onStart`
// (drive its CLI/SDK and translate to wire events) and lifecycle cleanup hooks.

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { env as procEnv, pid, stdout } from 'node:process';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import { WebSocketServer, type WebSocket } from 'ws';

export { HarnessBridgeCapabilityUnsupportedError } from './harness-bridge-capability-unsupported-error';

export type BridgeState = 'init' | 'waiting' | 'running' | 'draining' | 'done';

/** Outbound turn event the adapter emits. `seq` is added by the runtime. */
export type BridgeEvent = Record<string, unknown> & { type: string };

export type BridgeDebugLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface Experimental_BridgeUserMessage {
  readonly messageId: string;
  readonly text: string;
  accept(): void;
  reject(error: unknown): void;
}

export interface Experimental_BridgeUserMessageQueue extends AsyncIterable<Experimental_BridgeUserMessage> {
  readonly pendingCount: number;
  close(error?: unknown): void;
}

type InternalBridgeUserMessageQueue = Experimental_BridgeUserMessageQueue & {
  enqueue(input: { messageId: string; text: string }): void;
};

type BridgeUserMessageResponse = {
  type: 'user-message-response';
  messageId: string;
  accepted: boolean;
  error?: { message: string };
};

/**
 * Per-session diagnostics config. The host resolves it from settings +
 * env and sends it on `start.debug`; the bridge gates console capture and
 * structured `debug-event`s on it. When disabled, nothing is captured or
 * emitted and no `seq` is consumed.
 */
export interface BridgeDebugConfig {
  enabled?: boolean;
  level?: BridgeDebugLevel;
  subsystems?: string[];
}

const DEBUG_LEVEL_WEIGHT: Record<BridgeDebugLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/** Exact-or-dotted-prefix subsystem match (`'bridge'` matches `'bridge.turn'`). */
function subsystemMatches(
  filters: string[] | undefined,
  subsystem: string,
): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.some(
    filter => subsystem === filter || subsystem.startsWith(`${filter}.`),
  );
}

function formatBridgeError(err: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  if (err !== null && typeof err === 'object') {
    try {
      return { message: JSON.stringify(err) };
    } catch {}
  }
  return { message: String(err) };
}

function createBridgeUserMessageQueue(options: {
  respond(response: BridgeUserMessageResponse): void;
}): InternalBridgeUserMessageQueue {
  const messages: Experimental_BridgeUserMessage[] = [];
  const waiters: Array<
    (result: IteratorResult<Experimental_BridgeUserMessage>) => void
  > = [];
  const entries = new Map<
    string,
    {
      response?: BridgeUserMessageResponse;
      reject(error: unknown): void;
    }
  >();
  let closed = false;
  let pendingCount = 0;

  const enqueue = (input: { messageId: string; text: string }): void => {
    const existing = entries.get(input.messageId);
    if (existing != null) {
      if (existing.response != null) {
        options.respond(existing.response);
      }
      return;
    }

    let settled = false;
    const settle = (response: BridgeUserMessageResponse): void => {
      if (settled) return;
      settled = true;
      pendingCount--;
      const entry = entries.get(input.messageId);
      if (entry != null) entry.response = response;
      options.respond(response);
    };
    const message: Experimental_BridgeUserMessage = {
      messageId: input.messageId,
      text: input.text,
      accept: () => {
        settle({
          type: 'user-message-response',
          messageId: input.messageId,
          accepted: true,
        });
      },
      reject: error => {
        settle({
          type: 'user-message-response',
          messageId: input.messageId,
          accepted: false,
          error: { message: formatBridgeError(error).message },
        });
      },
    };
    entries.set(input.messageId, {
      reject: message.reject,
    });
    pendingCount++;

    if (closed) {
      message.reject(
        new Error('The bridge turn is no longer accepting user messages.'),
      );
      return;
    }

    const waiter = waiters.shift();
    if (waiter != null) {
      waiter({ done: false, value: message });
    } else {
      messages.push(message);
    }
  };

  const close = (error?: unknown): void => {
    if (closed) return;
    closed = true;
    const reason =
      error ??
      new Error('The bridge turn ended before accepting the user message.');
    for (const entry of entries.values()) {
      if (entry.response == null) entry.reject(reason);
    }
    messages.length = 0;
    while (waiters.length > 0) {
      waiters.shift()!({ done: true, value: undefined });
    }
  };

  return {
    get pendingCount() {
      return pendingCount;
    },
    enqueue,
    close,
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          const message = messages.shift();
          if (message != null) {
            return Promise.resolve({ done: false as const, value: message });
          }
          if (closed) {
            return Promise.resolve({
              done: true as const,
              value: undefined,
            });
          }
          return new Promise<IteratorResult<Experimental_BridgeUserMessage>>(
            resolve => {
              waiters.push(resolve);
            },
          );
        },
      };
    },
  };
}

function parseEnvList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

const ENV_TRUTHY = new Set(['1', 'true', 'yes', 'on']);

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
    input:
      | string
      | {
          toolCallId: string;
          matches?: (result: {
            output: unknown;
            isError?: boolean;
            toolResult?: ToolResultPart;
          }) => boolean;
        },
  ): Promise<{
    output: unknown;
    isError?: boolean;
    toolResult?: ToolResultPart;
  }>;

  /**
   * Register interest in a host approval decision and resolve when the matching
   * `tool-approval-response` arrives. The adapter emits the
   * `tool-approval-request` event itself using the same `approvalId`.
   */
  requestToolApproval(
    approvalId: string,
  ): Promise<{ approved: boolean; reason?: string }>;

  readonly experimental_userMessages: Experimental_BridgeUserMessageQueue;

  /** Aborts when the host sends `abort`. */
  readonly abortSignal: AbortSignal;

  /** True for the first turn since this bridge process started. */
  readonly firstTurn: boolean;

  /**
   * Emit a structured diagnostic. Gated by the session's debug level +
   * subsystem filter; a no-op when diagnostics are disabled. Adapters use this
   * for runtime-level instrumentation; raw `console.*` output is captured and
   * forwarded automatically.
   */
  bridgeLog(input: {
    level?: BridgeDebugLevel;
    subsystem: string;
    message: string;
    attrs?: Record<string, unknown>;
    error?: unknown;
  }): void;

  /**
   * Emit a non-fatal bridge warning to stderr using the runtime's harness
   * prefix. This is diagnostic-only: it does not emit a stream event, does not
   * consume a `seq`, and does not fail the turn.
   */
  emitWarning(input: { message: string }): void;

  emitError(input: { error: unknown; message?: string }): void;
}

export interface RunBridgeOptions<TStart extends { type: 'start' }> {
  /** Identifier written into `bridge-meta.json` (`'claude-code'` / `'codex'`). */
  bridgeType: string;
  /** Directory for `bridge-meta.json` / `start-config.json`. Created if absent. */
  bridgeStateDir: string;
  /**
   * Drive one prompt turn. Rejections surface to the host as an `error`
   * event.
   *
   * Contract: once `turn.abortSignal` fires, wind down promptly — turns are
   * serialized, and a replacement `start` waits up to
   * {@link turnTeardownGraceMs} for this promise to settle before it
   * proceeds anyway.
   */
  onStart(start: TStart, turn: BridgeTurn): Promise<void>;
  /**
   * How long a replacement `start` waits for the previous turn's teardown
   * after aborting it, in milliseconds. Turns are serialized so an aborted
   * turn cannot emit into its replacement's event log or overlap its runtime
   * process — but only within this bound: an adapter that does not settle
   * `onStart` after its abort signal fires forfeits the protection for that
   * boundary, and the new turn proceeds anyway rather than blocking forever.
   * The default of ten seconds exceeds the Claude bridge's five-second
   * hard-abort fallback.
   */
  turnTeardownGraceMs?: number;
  /**
   * Produce the adapter-defined runtime resume data for `stop`. Defaults to
   * `{}`.
   */
  onStop?(): unknown | Promise<unknown>;
  /**
   * Perform adapter-defined destruction before the bridge exits.
   */
  onDestroy?(): void | Promise<void>;
  /** WS port. Defaults to `BRIDGE_WS_PORT` env (0 = OS-assigned). */
  port?: number;
  /** Auth token. Defaults to `BRIDGE_CHANNEL_TOKEN` env. */
  token?: string;
  /** Called with the bound port once the server is listening. */
  onListening?(port: number): void;
  /**
   * Tear the process down after `stop` / `destroy`. Defaults to closing
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
      toolResult?: ToolResultPart;
    }
  | {
      type: 'tool-approval-response';
      approvalId: string;
      approved: boolean;
      reason?: string;
    }
  | { type: 'user-message'; messageId?: string; text: string }
  | { type: 'abort' }
  | { type: 'stop' }
  | { type: 'destroy' }
  | { type: 'resume'; lastSeenEventId: number };

const WS_OPEN = 1;

/**
 * Boot the bridge: bind the WebSocket server, announce `bridge-ready`, and
 * service host connections for the lifetime of the process. Resolves once the
 * server is listening; the process then stays alive on the server until a
 * `stop` / `destroy` exits it.
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
  const { bridgeType, bridgeStateDir, onStart, onStop, onDestroy } = options;
  const teardownGraceMs = options.turnTeardownGraceMs ?? 10_000;
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
  /*
   * The one connection turn events stream to. A socket claims it by asking for
   * work — `start` (a turn) or `resume` (a catch-up) — never by connecting:
   * every event goes here alone, so claiming on connect would silence a turn
   * already streaming to someone else. Any number of sockets may be connected;
   * the others still exchange control frames, they just get no events.
   */
  let activeSocket: WebSocket | undefined;
  let isFirstTurn = true;
  let turnAbort: AbortController | undefined;
  let currentUserMessages: InternalBridgeUserMessageQueue | undefined;
  /**
   * Settles when the in-flight turn has fully wound down — `onStart`
   * returned or threw AND its completion state was recorded. `undefined`
   * between turns. A new `start` fences on this so turns never overlap.
   */
  let activeTurn: Promise<void> | undefined;

  // Diagnostics. Resolved per turn from `start.debug` with a sandbox-side
  // env fallback; gates console capture + structured `debug-event`s.
  let debugConfig: BridgeDebugConfig | undefined;
  let consoleCaptureInstalled = false;
  const envDebugEnabled = ENV_TRUTHY.has(
    (procEnv.HARNESS_DEBUG ?? '').toLowerCase(),
  );

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
   * can reload the in-flight turn and serve a host's resume cursor —
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
    {
      resolve: (output: {
        output: unknown;
        isError?: boolean;
        toolResult?: ToolResultPart;
      }) => void;
      matches?: (output: {
        output: unknown;
        isError?: boolean;
        toolResult?: ToolResultPart;
      }) => boolean;
    }
  >();
  const bufferedToolResults: Array<{
    toolCallId: string;
    result: {
      output: unknown;
      isError?: boolean;
      toolResult?: ToolResultPart;
    };
  }> = [];
  const pendingToolApprovals = new Map<
    string,
    (response: { approved: boolean; reason?: string }) => void
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

  // ─── diagnostics ──────────────────────────────────────────────
  const shouldEmitDebugEvent = (
    level: BridgeDebugLevel,
    subsystem: string,
  ): boolean => {
    if (!debugConfig?.enabled) return false;
    const threshold = debugConfig.level ?? 'debug';
    if (DEBUG_LEVEL_WEIGHT[level] > DEBUG_LEVEL_WEIGHT[threshold]) return false;
    return subsystemMatches(debugConfig.subsystems, subsystem);
  };

  /*
   * Forward sandbox console output. We line-buffer the original writers (kept so
   * output still reaches the real fds) and emit one `sandbox-log` per complete
   * line. `emit` never writes to stdout/stderr, so there is no recursion.
   * Installed lazily the first time a turn enables diagnostics; once installed,
   * capture is gated per-write on `debugConfig.enabled` so a later turn can
   * disable it. Console capture is independent of the subsystem/level filter.
   */
  const rawStdoutWrite = process.stdout.write.bind(process.stdout);
  const rawStderrWrite = process.stderr.write.bind(process.stderr);

  const writeErrorToStderr = (input: {
    message: string;
    error: unknown;
  }): void => {
    try {
      const formatted = formatBridgeError(input.error);
      rawStderrWrite(
        `[harness:${bridgeType}:error] ${input.message}: ${formatted.message}\n`,
      );
      if (formatted.stack) {
        rawStderrWrite(`${formatted.stack}\n`);
      }
    } catch {}
  };

  const emitWarning = (input: { message: string }): void => {
    try {
      for (const line of input.message.split('\n')) {
        if (line.trim().length > 0) {
          rawStderrWrite(`[harness:${bridgeType}:warn] ${line}\n`);
        }
      }
    } catch {}
  };

  const emitError = (input: { error: unknown; message?: string }): void => {
    writeErrorToStderr({
      message: input.message ?? 'bridge error',
      error: input.error,
    });
    emit({ type: 'error', error: serialiseError(input.error) });
  };

  const installConsoleCapture = (): void => {
    if (consoleCaptureInstalled) return;
    consoleCaptureInstalled = true;
    const buffers: { stdout: string; stderr: string } = {
      stdout: '',
      stderr: '',
    };
    const patch =
      (stream: 'stdout' | 'stderr', raw: typeof process.stdout.write) =>
      (chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
        if (debugConfig?.enabled) {
          try {
            const enc = typeof encoding === 'string' ? encoding : 'utf8';
            const text =
              typeof chunk === 'string'
                ? chunk
                : Buffer.from(chunk as Uint8Array).toString(
                    enc as BufferEncoding,
                  );
            const combined = buffers[stream] + text.replace(/\r\n/g, '\n');
            const parts = combined.split('\n');
            buffers[stream] = parts.pop() ?? '';
            for (const line of parts) {
              const trimmed = line.replace(/\s+$/, '');
              if (trimmed) {
                emit({
                  type: 'sandbox-log',
                  source: bridgeType,
                  stream,
                  line: trimmed,
                });
              }
            }
          } catch {
            // Never let capture break real output.
          }
        }
        return (raw as (c: unknown, e?: unknown, cb?: unknown) => boolean)(
          chunk,
          encoding,
          cb,
        );
      };
    process.stdout.write = patch(
      'stdout',
      rawStdoutWrite,
    ) as typeof process.stdout.write;
    process.stderr.write = patch(
      'stderr',
      rawStderrWrite,
    ) as typeof process.stderr.write;
  };

  // ─── inbound routing ────────────────────────────────────────────────
  const handleInbound = async (
    msg: TStart | InboundControl,
    ws: WebSocket,
  ): Promise<void> => {
    switch (msg.type) {
      case 'start': {
        /*
         * A new turn replaces the active one — but only after the active one
         * has fully wound down. Inbound frames are dispatched concurrently,
         * and the host settles a caller abort immediately, so a retry's
         * `start` can arrive while the aborted turn is still tearing down
         * (e.g. a graceful interrupt). Without this fence the old turn would
         * keep emitting into the new turn's cleared event log, two runtime
         * processes would run side by side, and the old turn's completion
         * would mark the bridge `waiting` underneath the new turn. Abort the
         * old turn to hasten its teardown; adapters are expected to bound
         * that teardown themselves (e.g. a hard-abort fallback), but the
         * runtime does not rely on it: the wait is capped by the teardown
         * grace period, after which the new turn proceeds anyway — the
         * pre-fence overlapping behavior — rather than hanging behind a
         * teardown that never settles.
         */
        for (;;) {
          const pendingTurn = activeTurn;
          if (pendingTurn == null) break;
          turnAbort?.abort();
          currentUserMessages?.close(
            new Error('A new bridge turn replaced the active turn.'),
          );
          let graceTimer: ReturnType<typeof setTimeout> | undefined;
          const settled = await Promise.race([
            pendingTurn.then(() => true as const),
            new Promise<false>(resolve => {
              graceTimer = setTimeout(() => resolve(false), teardownGraceMs);
              graceTimer.unref?.();
            }),
          ]);
          clearTimeout(graceTimer);
          if (!settled) break;
        }
        let turnFinished!: () => void;
        const thisTurn = new Promise<void>(resolve => (turnFinished = resolve));
        activeTurn = thisTurn;
        activeSocket = ws; // asking for a turn claims the event stream
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
        const startDebug = (msg as { debug?: BridgeDebugConfig }).debug;
        debugConfig = {
          enabled: startDebug?.enabled ?? envDebugEnabled,
          level:
            startDebug?.level ??
            (procEnv.HARNESS_DEBUG_LEVEL as BridgeDebugLevel | undefined),
          subsystems:
            startDebug?.subsystems ??
            parseEnvList(procEnv.HARNESS_DEBUG_SUBSYSTEMS),
        };
        if (debugConfig.enabled) {
          installConsoleCapture();
        }
        const userMessages = createBridgeUserMessageQueue({ respond: emit });
        const turn: BridgeTurn = {
          emit,
          requestToolResult: requestInput => {
            const request =
              typeof requestInput === 'string'
                ? { toolCallId: requestInput }
                : requestInput;
            const bufferedIndex = bufferedToolResults.findIndex(
              buffered =>
                buffered.toolCallId === request.toolCallId ||
                request.matches?.(buffered.result) === true,
            );
            if (bufferedIndex >= 0) {
              return Promise.resolve(
                bufferedToolResults.splice(bufferedIndex, 1)[0].result,
              );
            }
            return new Promise(resolve => {
              pendingToolResults.set(request.toolCallId, {
                resolve,
                matches: request.matches,
              });
            });
          },
          requestToolApproval: approvalId =>
            new Promise(resolve => {
              pendingToolApprovals.set(approvalId, resolve);
            }),
          experimental_userMessages: userMessages,
          abortSignal: turnAbort.signal,
          firstTurn,
          bridgeLog: input => {
            const level = input.level ?? 'debug';
            if (!shouldEmitDebugEvent(level, input.subsystem)) return;
            emit({
              type: 'debug-event',
              level,
              subsystem: input.subsystem,
              message: input.message,
              ...(input.attrs ? { attrs: input.attrs } : {}),
              ...(input.error !== undefined
                ? { error: formatBridgeError(input.error) }
                : {}),
            });
          },
          emitWarning,
          emitError,
        };
        currentUserMessages = userMessages;
        try {
          await onStart(msg as TStart, turn);
        } catch (err) {
          emitError({ error: err, message: 'bridge turn failed' });
        } finally {
          userMessages.close();
          if (currentUserMessages === userMessages) {
            currentUserMessages = undefined;
          }
          // Only the still-active turn records completion: after a fence
          // timeout a replacement turn is already running, and this stale
          // completion must not mark the bridge waiting underneath it.
          if (activeTurn === thisTurn) {
            activeTurn = undefined;
            currentTurnState = 'waiting';
            void writeBridgeMeta('waiting');
          }
          turnFinished();
        }
        return;
      }
      case 'tool-result': {
        const result = {
          output: msg.output,
          isError: msg.isError,
          toolResult: msg.toolResult,
        };
        const exactPending = pendingToolResults.get(msg.toolCallId);
        const matchingPending =
          exactPending == null
            ? Array.from(pendingToolResults.entries()).find(
                ([, pending]) => pending.matches?.(result) === true,
              )
            : undefined;
        const pending = exactPending ?? matchingPending?.[1];
        const pendingId =
          exactPending != null ? msg.toolCallId : matchingPending?.[0];
        if (pending != null && pendingId != null) {
          pendingToolResults.delete(pendingId);
          pending.resolve(result);
        } else {
          bufferedToolResults.push({
            toolCallId: msg.toolCallId,
            result,
          });
        }
        return;
      }
      case 'tool-approval-response': {
        const resolver = pendingToolApprovals.get(msg.approvalId);
        if (resolver) {
          pendingToolApprovals.delete(msg.approvalId);
          resolver({ approved: msg.approved, reason: msg.reason });
        }
        return;
      }
      case 'user-message': {
        const messageId = msg.messageId ?? randomUUID();
        if (currentUserMessages == null) {
          sendControl(ws, {
            type: 'user-message-response',
            messageId,
            accepted: false,
            error: { message: 'The bridge has no active turn to steer.' },
          });
          return;
        }
        if (ws !== activeSocket) {
          sendControl(ws, {
            type: 'user-message-response',
            messageId,
            accepted: false,
            error: {
              message: 'The connection does not own the active bridge turn.',
            },
          });
          return;
        }
        currentUserMessages.enqueue({
          messageId,
          text: msg.text,
        });
        return;
      }
      case 'abort':
        turnAbort?.abort();
        return;
      case 'resume':
        activeSocket = ws; // asking for a catch-up claims it too
        // Synchronous, so no event can slip out live ahead of the replayed tail.
        replay(ws, msg.lastSeenEventId);
        return;
      case 'destroy':
        currentTurnState = 'done';
        void writeBridgeMeta('done');
        await onDestroy?.();
        drainThenExit(ws, 1000, 'destroy');
        return;
      case 'stop': {
        currentTurnState = 'done';
        void writeBridgeMeta('done');
        const data = (await onStop?.()) ?? {};
        sendControl(ws, { type: 'bridge-stop', data });
        drainThenExit(ws, 1000, 'stop');
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
        // Flush the on-disk log so a clean stop/destroy leaves a complete
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

    // Announce liveness the instant we accept. Some sandbox runtimes complete
    // the host-side WS handshake before the connection is forwarded here; the
    // host waits for this frame before sending `start`/`resume`.
    sendControl(ws, {
      type: 'bridge-hello',
      state: currentTurnState,
      lastSeq: seqCounter,
      capabilities: { experimental_userMessageResponses: true },
    });

    ws.on('message', (raw: ArrayBufferLike | string) => {
      let parsed: TStart | InboundControl;
      try {
        const text =
          typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
        parsed = JSON.parse(text) as TStart | InboundControl;
      } catch (err) {
        sendControl(ws, {
          type: 'error',
          error: `protocol parse error: ${(err as Error).message}`,
        });
        return;
      }
      void handleInbound(parsed, ws);
    });

    ws.on('close', () => {
      // Only the stream owner's close matters; a socket that never claimed it,
      // or that a later `start`/`resume` displaced, closes as a no-op.
      // Crucially we do NOT abort the in-flight turn: it keeps running and its
      // events accumulate in the log for replay on reconnect.
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
    emitError({ error: err, message: 'uncaught exception' });
  });
  process.on('unhandledRejection', err => {
    emitError({ error: err, message: 'unhandled rejection' });
  });

  await new Promise<void>((resolve, reject) => {
    if (wss.address() != null) {
      resolve();
      return;
    }

    wss.once('listening', resolve);
    wss.once('error', reject);
  });

  return {
    port: currentBoundPort,
    close: () =>
      new Promise<void>(resolve => {
        wss.close(() => resolve());
      }),
  };
}

/*
 * Control frames answer the socket that sent the frame they reply to, so the
 * target is always explicit. Event streaming is the separate, stateful path
 * (`emit` → `activeSocket`); this one carries no state at all.
 */
function sendControl(
  socket: WebSocket | undefined,
  message: Record<string, unknown>,
): void {
  if (socket?.readyState === WS_OPEN) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // best-effort
    }
  }
}

function serialiseError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}
