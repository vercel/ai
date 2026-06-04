import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  classifyDiskLog,
  commonTool,
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1DebugConfig,
  type HarnessV1BuiltinTool,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1RecoveryMode,
  type HarnessV1ResumeState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  safeParseJSON,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { resolveCodexEnv, type CodexAuthOptions } from './codex-auth';
import { SandboxChannel } from '@ai-sdk/harness/channel';
import {
  bridgeReadySchema,
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './codex-bridge-protocol';

type CodexChannel = SandboxChannel<OutboundMessage, InboundMessage>;

/*
 * The model the adapter pins when the consumer configures none. The Codex SDK
 * does not report the model it resolves to at runtime (no model field on any
 * event), and exposes no default-model constant, so we pin the latest
 * codex-specialized model available for the bundled `@openai/codex@0.130.0`
 * (published 2026-05-08): `gpt-5.3-codex` (released 2026-02). Keep this in sync
 * when bumping the codex SDK/binary. Passing it explicitly makes the resolved
 * model deterministic and the telemetry (`gen_ai.request.model`) accurate.
 */
const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';

export type CodexHarnessSettings = {
  readonly auth?: CodexAuthOptions;
  /**
   * OpenAI model id the underlying `codex` CLI should use. Leaving this unset
   * pins the adapter default (`DEFAULT_CODEX_MODEL`).
   */
  readonly model?: string;
  /**
   * Reasoning effort for reasoning-capable models. Leaving this unset
   * defers to the CLI's default.
   */
  readonly reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * When `true`, allow the underlying runtime to use live web search.
   */
  readonly webSearch?: boolean;
  /**
   * Override the port the bridge binds inside the sandbox. By default the
   * adapter uses the first port the sandbox declares via `sandbox.ports`.
   * Only set this if the sandbox declares multiple ports and the first one
   * is reserved for something else.
   */
  readonly port?: number;
  /** Maximum milliseconds to wait for the bridge to advertise its port. Defaults to 120000. */
  readonly startupTimeoutMs?: number;
};

/*
 * Every native tool the Codex CLI can invoke as a model-callable tool,
 * declared as a `ToolSet` keyed by what the bridge emits as `toolName` on
 * the wire (`commonName ?? nativeName`). Schemas reflect the `ThreadItem`
 * union in `@openai/codex-sdk`'s `dist/index.d.ts`.
 *
 * Codex's other native operations (`apply_patch`, todo planning) surface
 * only as side-effect events (`file_change`, `todo_list`) and are not
 * model-callable tools — they don't appear here.
 */
const CODEX_BUILTIN_TOOLS = {
  bash: commonTool('bash', {
    nativeName: 'shell',
    description: 'Execute a shell command',
    inputSchema: z.object({ command: z.string() }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    description: 'Search the web',
    inputSchema: z.object({ query: z.string() }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

/*
 * Bootstrap lives in /tmp because it's pure derived state — the harness can
 * reinstall the CLI and bridge files on any fresh sandbox from the recipe.
 * Persistence comes from the sandbox provider's snapshot, not the path.
 *
 * The session work dir (`startOpts.sessionWorkDir`) and the bridge-state dir
 * derived from `sandboxSession.defaultWorkingDirectory` both live under the sandbox's
 * default working directory — the provider's persistent mount — so the
 * workdir's contents (the codex CLI shim and any files the agent edits) and
 * the bridge state files survive the detach -> snapshot -> resume cycle.
 */
const BOOTSTRAP_DIR = '/tmp/harness/codex';

/**
 * Live bridge coordinates carried by `getResumeHandle()`. A future process uses
 * them to reopen a socket to the still-running bridge (`attach`) instead of
 * re-spawning it. Absent on a `detach()` payload (that stops the bridge).
 */
const bridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});

/**
 * Schema for the adapter-specific `HarnessV1ResumeState.data` payload Codex
 * produces. `threadId` is what `codex.resumeThread(...)` requires for the
 * replay/rerun rungs; the sandbox lookup is handled separately via
 * `provider.resume({ sessionId })`. `bridge` carries live coordinates for
 * cross-process `attach` (present only on `getResumeHandle()` payloads).
 */
const codexResumeStateSchema = z.object({
  threadId: z.string().optional(),
  bridge: bridgeCoordsSchema.optional(),
});

type CodexBridgeCoords = z.infer<typeof bridgeCoordsSchema>;

export function createCodex(
  settings: CodexHarnessSettings = {},
): HarnessV1<typeof CODEX_BUILTIN_TOOLS> {
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'codex',
    builtinTools: CODEX_BUILTIN_TOOLS,
    resumeStateSchema: codexResumeStateSchema,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [pkg, lock, bridge, hostToolMcp] = await Promise.all([
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
        readBridgeAsset('index.mjs'),
        readBridgeAsset('host-tool-mcp.mjs'),
      ]);
      cachedBootstrap = {
        harnessId: 'codex',
        bootstrapDir: BOOTSTRAP_DIR,
        files: [
          { path: `${BOOTSTRAP_DIR}/package.json`, content: pkg },
          { path: `${BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
          { path: `${BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
          {
            path: `${BOOTSTRAP_DIR}/host-tool-mcp.mjs`,
            content: hostToolMcp,
          },
        ],
        commands: [
          { command: `mkdir -p ${BOOTSTRAP_DIR}` },
          {
            command: `pnpm --dir ${BOOTSTRAP_DIR} install --frozen-lockfile --store-dir ${BOOTSTRAP_DIR}/.pnpm-store`,
          },
        ],
      };
      return cachedBootstrap;
    },
    doStart: async startOpts => {
      // `sandbox` and `sessionWorkDir` are coupled in
      // `HarnessV1StartOptions`, so this one check narrows both.
      if (startOpts.sandboxSession == null) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: 'codex',
          message:
            'The codex harness requires a sandbox provider. Pass `sandbox` to the HarnessAgent constructor.',
        });
      }
      const sandboxSession = startOpts.sandboxSession;
      const session = sandboxSession.restricted();
      const sandboxId = sandboxSession.id;
      const isResume = startOpts.resumeFrom != null;
      const resumeData =
        isResume && typeof startOpts.resumeFrom?.data === 'object'
          ? (startOpts.resumeFrom.data as {
              threadId?: unknown;
              bridge?: CodexBridgeCoords;
            })
          : undefined;
      const resumeThreadId = resumeData?.threadId;
      const resumeThreadIdString =
        typeof resumeThreadId === 'string' && resumeThreadId.length > 0
          ? resumeThreadId
          : undefined;
      const coords = resumeData?.bridge;

      const workDir = startOpts.sessionWorkDir;
      const sessionDataDir = `${sandboxSession.defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const timeoutMs = settings.startupTimeoutMs ?? 120_000;

      // Normalize each forwarded bridge diagnostics frame into the general
      // `HarnessV1Diagnostic` and report it. The adapter does no telemetry work
      // beyond this transport→emission mapping.
      const report = startOpts.observability?.report;
      const onDiagnostic = report
        ? (frame: Parameters<typeof harnessV1DiagnosticFromBridgeFrame>[0]) =>
            report(
              harnessV1DiagnosticFromBridgeFrame(frame, {
                sessionId: startOpts.sessionId,
                timestamp: Date.now(),
              }),
            )
        : undefined;

      /*
       * Rung 1 — ATTACH. With live coordinates, reopen a socket to the
       * still-running bridge and replay everything past the persisted cursor.
       * No spawn, no fresh token. If the bridge is gone the open throws and we
       * fall through to a spawn-based recovery.
       */
      if (coords) {
        try {
          const attachUrl =
            (await sandboxSession.getPortUrl({
              port: coords.port,
              protocol: 'ws',
            })) + `?agent_bridge_token=${encodeURIComponent(coords.token)}`;
          const attachChannel: CodexChannel = new SandboxChannel({
            connect: () => openWebSocket(attachUrl),
            outboundSchema: outboundMessageSchema,
            initialLastSeenEventId: coords.lastSeenEventId,
            onDiagnostic,
          });
          await attachChannel.open({ resume: true });
          return createSession({
            sessionId: startOpts.sessionId,
            channel: attachChannel,
            // The live bridge was spawned by another process; no process handle.
            proc: undefined,
            skills: startOpts.skills,
            model: settings.model ?? DEFAULT_CODEX_MODEL,
            reasoningEffort: settings.reasoningEffort,
            webSearch: settings.webSearch,
            resumeThreadId: resumeThreadIdString,
            recoveryMode: 'attach',
            bridgePort: coords.port,
            bridgeToken: coords.token,
            sandboxId,
            debug: startOpts.observability?.debug,
          });
        } catch {
          // Bridge no longer reachable — recover by respawning below.
        }
      }

      /*
       * Rungs 2/3 — REPLAY vs RERUN. Respawn the bridge. `replay` is only sound
       * when the resume payload carried live coordinates (`getResumeHandle`),
       * because those include the cursor the on-disk log is replayed *from*. A
       * payload without coordinates — e.g. from a destructive `detach()` — has
       * no cursor, so replaying a finished turn from seq 0 would re-deliver it
       * into the next turn. Those resumes always `rerun` (the bridge takes the
       * `codex.resumeThread(threadId)` branch).
       */
      let recoveryMode: HarnessV1RecoveryMode = isResume ? 'rerun' : 'cold';
      if (coords) {
        const logRaw = await Promise.resolve(
          session.readTextFile({
            path: `${bridgeStateDir}/event-log.ndjson`,
            abortSignal: startOpts.abortSignal,
          }),
        ).catch(() => null);
        if ((await classifyDiskLog(logRaw)) === 'replay') {
          recoveryMode = 'replay';
        }
      }

      const port = resolveBridgePort(sandboxSession, settings.port);
      const token = randomBytes(32).toString('hex');
      const env = {
        ...resolveCodexEnv(settings.auth),
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
        ...(recoveryMode === 'replay' ? { BRIDGE_REPLAY_FROM_DISK: '1' } : {}),
      };

      if (recoveryMode === 'cold') {
        await session.run({
          command: `mkdir -p ${workDir} ${bridgeStateDir}`,
          abortSignal: startOpts.abortSignal,
        });
      }

      const proc = await session.spawn({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${workDir} --bridge-state-dir ${bridgeStateDir} --bootstrap-dir ${BOOTSTRAP_DIR}`,
        env,
        abortSignal: startOpts.abortSignal,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        timeoutMs,
        abortSignal: startOpts.abortSignal,
      });

      const wsUrl =
        (await sandboxSession.getPortUrl({
          port: boundPort,
          protocol: 'ws',
        })) + `?agent_bridge_token=${encodeURIComponent(token)}`;

      const channel: CodexChannel = new SandboxChannel({
        connect: () => openWebSocket(wsUrl),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
        // In replay mode the respawned bridge reloaded the finished turn from
        // disk; seed the cursor and resume so it streams the tail (incl.
        // `finish`).
        ...(recoveryMode === 'replay'
          ? { initialLastSeenEventId: coords?.lastSeenEventId ?? 0 }
          : {}),
      });
      await channel.open(
        recoveryMode === 'replay' ? { resume: true } : undefined,
      );

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        skills: startOpts.skills,
        model: settings.model ?? DEFAULT_CODEX_MODEL,
        reasoningEffort: settings.reasoningEffort,
        webSearch: settings.webSearch,
        resumeThreadId: resumeThreadIdString,
        recoveryMode,
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        debug: startOpts.observability?.debug,
      });
    },
  };
}

function resolveBridgePort(
  sandboxSession: HarnessV1NetworkSandboxSession,
  override: number | undefined,
): number {
  if (override !== undefined) return override;
  if (sandboxSession.ports.length > 0) return sandboxSession.ports[0];
  throw new HarnessCapabilityUnsupportedError({
    harnessId: 'codex',
    message:
      'The codex harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createCodex({ port })`.',
  });
}

async function readBridgeAsset(name: string): Promise<string> {
  const candidates = [
    new URL(`./bridge/${name}`, import.meta.url),
    new URL(`../bridge/${name}`, import.meta.url),
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`bridge asset not found: ${name}`);
}

async function waitForBridgeReady({
  proc,
  timeoutMs,
  abortSignal,
}: {
  proc: Experimental_SandboxProcess;
  timeoutMs: number;
  abortSignal: AbortSignal | undefined;
}): Promise<{ port: number }> {
  const reader = proc.stdout.pipeThrough(new TextDecoderStream()).getReader();

  const decoder = lineDecoder();

  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      if (abortSignal?.aborted) {
        await proc.kill();
        throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await proc.kill();
        throw new Error('codex bridge did not become ready in time.');
      }
      const { value, done } = (await Promise.race([
        reader.read(),
        new Promise(resolve =>
          setTimeout(
            () => resolve({ value: undefined, done: false }),
            remaining,
          ),
        ),
      ])) as ReadableStreamReadResult<string>;
      if (done) {
        throw new Error('codex bridge exited before becoming ready.');
      }
      if (value === undefined) continue;
      for (const line of decoder.push(value)) {
        const parsed = await safeParseJSON({
          text: line,
          schema: bridgeReadySchema,
        });
        if (parsed.success) return { port: parsed.value.port };
      }
    }
  } finally {
    reader.releaseLock();
    void drainRest(proc.stdout);
    /*
     * Bridge stderr is the only diagnostic channel for what happens
     * inside the sandbox once the bridge is running (uncaught
     * exceptions, Codex SDK errors, network failures). Forward it
     * line-by-line to the host console so a mid-turn bridge crash can
     * be inspected from `pnpm dev` logs without redeploying. The
     * bridge itself writes nothing to stderr in steady state, so this
     * is silent on the happy path.
     */
    void forwardBridgeStderr(proc.stderr);
  }
}

function lineDecoder() {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines: string[] = [];
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const line = raw.replace(/\r$/, '').trim();
        if (line.length > 0) lines.push(line);
      }
      return lines;
    },
  };
}

async function forwardBridgeStderr(
  stream: ReadableStream<Uint8Array>,
): Promise<void> {
  try {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) {
        const trimmed = value.endsWith('\n') ? value.slice(0, -1) : value;
        if (trimmed.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`[bridge stderr] ${trimmed}`);
        }
      }
    }
  } catch {
    // Reader errors are non-fatal — best-effort diagnostic only.
  }
}

async function drainRest(stream: ReadableStream<Uint8Array>): Promise<void> {
  try {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) return;
    }
  } catch {}
}

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onOpen = () => {
      ws.off('error', onError);
      resolve(ws);
    };
    const onError = (err: Error) => {
      ws.off('open', onOpen);
      reject(err);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
}

function createSession({
  sessionId,
  channel,
  proc,
  skills,
  model,
  reasoningEffort,
  webSearch,
  resumeThreadId,
  recoveryMode,
  bridgePort,
  bridgeToken,
  sandboxId,
  debug,
}: {
  sessionId: string;
  channel: CodexChannel;
  /** Undefined on `attach` — the live bridge was spawned by another process. */
  proc: Experimental_SandboxProcess | undefined;
  skills: ReadonlyArray<HarnessV1Skill> | undefined;
  model: string | undefined;
  reasoningEffort: 'low' | 'medium' | 'high' | undefined;
  webSearch: boolean | undefined;
  resumeThreadId: string | undefined;
  recoveryMode: HarnessV1RecoveryMode;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string;
  debug: HarnessV1DebugConfig | undefined;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  /*
   * Send the persisted threadId on the first prompt only when the bridge was
   * respawned (rerun/replay) so it takes the `codex.resumeThread(...)` branch.
   * An `attach`ed bridge already holds its threadState in memory and continues
   * on its own, so it needs no seed.
   */
  let pendingResumeThreadId =
    recoveryMode === 'rerun' || recoveryMode === 'replay'
      ? resumeThreadId
      : undefined;
  /*
   * Instructions are prepended to the first user message of a fresh session
   * only. A resumed session (attach/replay/rerun) already carried them in its
   * original first message (preserved in the persisted thread), so it starts
   * "applied".
   */
  let instructionsApplied = recoveryMode !== 'cold';

  /*
   * Latest codex thread id, cached from the bridge's `bridge-thread`
   * announcements. Seeded from a resume payload so `getResumeHandle()` reports
   * a thread id even before this process has run a turn. Read live by
   * `doGetResumeHandle` for the replay/rerun fallback.
   */
  let latestThreadId = resumeThreadId;
  channel.on('bridge-thread', msg => {
    latestThreadId = msg.threadId;
  });

  return {
    sessionId,
    recoveryMode,
    modelId: model,
    doPrompt: async promptOpts => {
      let pendingResolve: (() => void) | undefined;
      let pendingReject: ((err: unknown) => void) | undefined;
      const done = new Promise<void>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
      });

      const unsubs: Array<() => void> = [];
      const forward = (event: HarnessV1StreamPart) => {
        try {
          promptOpts.emit(event);
        } catch {}
      };

      const eventTypes = [
        'stream-start',
        'text-start',
        'text-delta',
        'text-end',
        'reasoning-start',
        'reasoning-delta',
        'reasoning-end',
        'tool-call',
        'tool-result',
        'file-change',
        'finish-step',
        'raw',
      ] as const;
      let isSettled = false;
      const settleSuccess = () => {
        if (isSettled) return;
        isSettled = true;
        for (const u of unsubs) u();
        pendingResolve!();
      };
      const settleError = (err: unknown) => {
        if (isSettled) return;
        isSettled = true;
        for (const u of unsubs) u();
        pendingReject!(err);
      };

      for (const type of eventTypes) {
        unsubs.push(
          channel.on(type, msg => {
            forward(msg);
          }),
        );
      }
      unsubs.push(
        channel.on('finish', msg => {
          forward(msg);
          settleSuccess();
        }),
      );
      unsubs.push(
        channel.on('error', msg => {
          forward(msg);
          settleError(msg.error);
        }),
      );

      const onClose = () => {
        if (!isSettled) {
          settleError(
            new Error('codex bridge closed before the turn finished.'),
          );
        }
      };
      channel.onClose(onClose);

      const onAbort = () => {
        if (isSettled) return;
        try {
          channel.send({ type: 'abort' });
        } catch {}
        settleError(
          promptOpts.abortSignal?.reason ??
            new DOMException('Aborted', 'AbortError'),
        );
      };
      if (promptOpts.abortSignal) {
        if (promptOpts.abortSignal.aborted) {
          onAbort();
        } else {
          promptOpts.abortSignal.addEventListener('abort', onAbort, {
            once: true,
          });
        }
      }

      const applyInstructions =
        !instructionsApplied && !!promptOpts.instructions;
      instructionsApplied = true;

      const startMessage = {
        type: 'start' as const,
        prompt: extractUserText(promptOpts.prompt),
        ...(applyInstructions ? { instructions: promptOpts.instructions } : {}),
        tools: (promptOpts.tools ?? []).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        model,
        reasoningEffort,
        webSearch,
        ...(skills && skills.length > 0
          ? {
              skills: skills.map(s => ({
                name: s.name,
                description: s.description,
                content: s.content,
              })),
            }
          : {}),
        ...(pendingResumeThreadId
          ? { resumeThreadId: pendingResumeThreadId }
          : {}),
        ...(debug ? { debug } : {}),
      };
      pendingResumeThreadId = undefined;
      channel.send(startMessage);

      const control: HarnessV1PromptControl = {
        submitToolResult: async input => {
          channel.send({
            type: 'tool-result',
            toolCallId: input.toolCallId,
            output: input.output,
            isError: input.isError,
          });
        },
        submitUserMessage: async text => {
          channel.send({ type: 'user-message', text });
        },
        done,
      };
      return control;
    },
    doStop: async () => {
      if (stopped) return stopPromise;
      stopped = true;
      stopPromise = (async () => {
        // Tell the channel we are tearing down so the bridge's post-shutdown
        // socket close finalises instead of triggering a reconnect.
        channel.beginClose();
        try {
          if (!channel.isClosed()) {
            channel.send({ type: 'shutdown' });
          }
        } catch {}
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (proc) {
            await Promise.race([
              proc.wait(),
              new Promise<void>(resolve => {
                stopTimer = setTimeout(resolve, 5000);
                stopTimer.unref?.();
              }),
            ]);
          }
        } finally {
          if (stopTimer) clearTimeout(stopTimer);
          try {
            await proc?.kill();
          } catch {}
          channel.close();
        }
      })();
      return stopPromise;
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `codex session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      /*
       * If the bridge's channel already closed (e.g. mid-turn WS drop)
       * there is no one to ack a `detach` message. Synthesize an empty
       * payload — the workdir is still captured by the sandbox snapshot
       * during the subsequent `sandboxSession.stop()`, so the next turn can
       * resume the filesystem state. The trade-off: we lose
       * `threadId`, so the codex CLI starts a fresh thread on the
       * preserved workdir rather than resuming the prior conversation
       * inside Codex's runtime. Ability to continue beats throwing.
       */
      // Tell the channel we are tearing down so the bridge's post-detach
      // socket close finalises instead of triggering a reconnect.
      channel.beginClose();
      const data: unknown = channel.isClosed()
        ? {}
        : await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              unsub();
              reject(
                new Error(
                  `codex session ${sessionId} did not reply to detach within 5s.`,
                ),
              );
            }, 5000);
            timer.unref?.();
            const unsub = channel.on('bridge-detach', msg => {
              clearTimeout(timer);
              unsub();
              resolve(msg.data);
            });
            try {
              channel.send({ type: 'detach' });
            } catch (err) {
              clearTimeout(timer);
              unsub();
              reject(err);
            }
          });

      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (proc) {
          await Promise.race([
            proc.wait(),
            new Promise<void>(resolve => {
              stopTimer = setTimeout(resolve, 5000);
              stopTimer.unref?.();
            }),
          ]);
        }
      } finally {
        if (stopTimer) clearTimeout(stopTimer);
        try {
          await proc?.kill();
        } catch {}
        channel.close();
      }

      const payload: HarnessV1ResumeState = {
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: (data ?? {}) as HarnessV1ResumeState['data'],
      };
      return payload;
    },
    doGetResumeHandle: () => {
      if (stopped) {
        throw new Error(
          `codex session ${sessionId} is stopped; cannot read a resume handle.`,
        );
      }
      /*
       * Non-destructive: capture the live bridge coordinates (for `attach`)
       * plus the latest thread id (for the replay/rerun fallback) without
       * tearing anything down. Both are read live, so this stays accurate when
       * called again after more turns.
       */
      const payload: HarnessV1ResumeState = {
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestThreadId ? { threadId: latestThreadId } : {}),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId: channel.lastSeenEventId,
            sandboxId,
          },
        },
      };
      return payload;
    },
  };
}

/*
 * Reduce a `HarnessV1Prompt` to the plain user text the bridge forwards
 * to the Codex SDK. File and image parts on the message are not yet
 * supported by the underlying runtime — throw rather than silently drop
 * them so callers learn about the gap instead of seeing mysteriously
 * truncated prompts.
 */
function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'codex',
        message: `The codex harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
