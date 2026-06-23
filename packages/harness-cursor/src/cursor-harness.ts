import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1DebugConfig,
  type HarnessV1BuiltinTool,
  type HarnessV1ContinueTurnState,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1ResumeSessionState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PermissionMode,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  classifyDiskLog,
  markBridgeStarting,
  SandboxChannel,
  waitForBridgeReady,
} from '@ai-sdk/harness/utils';
import { type Experimental_SandboxProcess, tool } from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { resolveCursorEnv, type CursorAuthOptions } from './cursor-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './cursor-bridge-protocol';
import { writeCursorSkills } from './cursor-skills';

type CursorChannel = SandboxChannel<OutboundMessage, InboundMessage>;
type CursorRespawnStrategy = 'replay' | 'rerun';

const DEFAULT_CURSOR_MODEL = 'composer-2.5';

export type CursorHarnessSettings = {
  readonly auth?: CursorAuthOptions;
  /**
   * Cursor model id. Leaving this unset pins the adapter default
   * (`DEFAULT_CURSOR_MODEL`).
   */
  readonly model?: string;
  /**
   * Override the port the bridge binds inside the sandbox. By default the
   * adapter uses the first port the sandbox declares via `sandbox.ports`.
   */
  readonly port?: number;
  /** Maximum milliseconds to wait for the bridge to advertise its port. */
  readonly startupTimeoutMs?: number;
};

const CURSOR_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'read',
    toolUseKind: 'readonly',
    description: 'Read file contents.',
    inputSchema: z.object({
      file_path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'write',
    toolUseKind: 'edit',
    description: 'Write or overwrite a file.',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'edit',
    toolUseKind: 'edit',
    description: 'Edit a file by replacement.',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'shell',
    toolUseKind: 'bash',
    description: 'Execute a shell command.',
    inputSchema: z.object({ command: z.string() }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    description: 'Search file contents.',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'glob',
    toolUseKind: 'readonly',
    description: 'Find files by pattern.',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  ls: tool({
    description: 'List directory contents.',
    inputSchema: z.object({ path: z.string().optional() }),
  }),
  semSearch: tool({
    description: 'Semantic codebase search.',
    inputSchema: z.object({ query: z.string() }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

const BOOTSTRAP_DIR = '/tmp/harness/cursor';

const cursorBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});

const cursorResumeStateSchema = z.object({
  agentId: z.string().optional(),
  bridge: cursorBridgeCoordsSchema.optional(),
});

type CursorBridgeCoords = z.infer<typeof cursorBridgeCoordsSchema>;

function permissionModeToAutoReview(
  permissionMode: HarnessV1PermissionMode | undefined,
): boolean {
  return permissionMode != null && permissionMode !== 'allow-all';
}

export function createCursor(
  settings: CursorHarnessSettings = {},
): HarnessV1<typeof CURSOR_BUILTIN_TOOLS> {
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'cursor',
    builtinTools: CURSOR_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: false,
    lifecycleStateSchema: cursorResumeStateSchema,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [pkg, lock, bridge] = await Promise.all([
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
        readBridgeAsset('index.mjs'),
      ]);
      cachedBootstrap = {
        harnessId: 'cursor',
        bootstrapDir: BOOTSTRAP_DIR,
        files: [
          { path: `${BOOTSTRAP_DIR}/package.json`, content: pkg },
          { path: `${BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
          { path: `${BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
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
      const sandboxSession = startOpts.sandboxSession;
      const session = sandboxSession.restricted();
      const sandboxId = sandboxSession.id;
      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const isResume = lifecycleState != null;
      const isContinue = startOpts.continueFrom != null;
      const resumeData =
        isResume && typeof lifecycleState?.data === 'object'
          ? (lifecycleState.data as {
              agentId?: unknown;
              bridge?: CursorBridgeCoords;
            })
          : undefined;
      const resumeAgentId = resumeData?.agentId;
      const resumeAgentIdString =
        typeof resumeAgentId === 'string' && resumeAgentId.length > 0
          ? resumeAgentId
          : undefined;
      const coords = resumeData?.bridge;
      const autoReview = permissionModeToAutoReview(startOpts.permissionMode);

      const workDir = startOpts.sessionWorkDir;
      const sessionDataDir = `${sandboxSession.defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const timeoutMs = settings.startupTimeoutMs ?? 120_000;

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

      if (coords) {
        try {
          const attachUrl =
            (await sandboxSession.getPortUrl({
              port: coords.port,
              protocol: 'ws',
            })) + `?agent_bridge_token=${encodeURIComponent(coords.token)}`;
          const attachChannel: CursorChannel = new SandboxChannel({
            connect: () => openWebSocket(attachUrl),
            outboundSchema: outboundMessageSchema,
            initialLastSeenEventId: coords.lastSeenEventId,
            onDiagnostic,
          });
          await attachChannel.open(isContinue ? { resume: true } : undefined);
          return createSession({
            sessionId: startOpts.sessionId,
            channel: attachChannel,
            proc: undefined,
            model: settings.model ?? DEFAULT_CURSOR_MODEL,
            autoReview,
            resumeAgentId: resumeAgentIdString,
            isResume: true,
            seedResumeAgentOnFirstPrompt: false,
            rerunContinue: false,
            bridgePort: coords.port,
            bridgeToken: coords.token,
            sandboxId,
            debug: startOpts.observability?.debug,
            permissionMode: startOpts.permissionMode,
          });
        } catch {
          // Bridge no longer reachable — recover by respawning below.
        }
      }

      let respawnStrategy: CursorRespawnStrategy | undefined = isResume
        ? 'rerun'
        : undefined;
      if (coords && isContinue) {
        const logRaw = await Promise.resolve(
          session.readTextFile({
            path: `${bridgeStateDir}/event-log.ndjson`,
            abortSignal: startOpts.abortSignal,
          }),
        ).catch(() => null);
        if ((await classifyDiskLog(logRaw)) === 'replay') {
          respawnStrategy = 'replay';
        }
      }

      const port = resolveBridgePort(sandboxSession, settings.port);
      const token = randomBytes(32).toString('hex');
      const skillSetup =
        startOpts.skills && startOpts.skills.length > 0
          ? await writeCursorSkills({
              sandbox: session,
              skills: startOpts.skills,
              abortSignal: startOpts.abortSignal,
            })
          : undefined;
      const env = {
        ...resolveCursorEnv(settings.auth),
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
        ...(skillSetup ? { HOME: skillSetup.homeDir } : {}),
        ...(respawnStrategy === 'replay'
          ? { BRIDGE_REPLAY_FROM_DISK: '1' }
          : {}),
      };

      if (respawnStrategy === undefined) {
        await session.run({
          command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
          abortSignal: startOpts.abortSignal,
        });
      }

      await markBridgeStarting({
        sandbox: session,
        bridgeStateDir,
        bridgeType: 'cursor',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await session.spawn({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --bootstrap-dir ${BOOTSTRAP_DIR}`,
        env,
        abortSignal: startOpts.abortSignal,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: session,
        bridgeStateDir,
        bridgeType: 'cursor',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: () =>
          new Error('cursor bridge did not become ready in time.'),
        createExitError: () =>
          new Error('cursor bridge exited before becoming ready.'),
      });
      void drainRest(proc.stdout);
      void forwardBridgeStderr(proc.stderr);

      const wsUrl =
        (await sandboxSession.getPortUrl({
          port: boundPort,
          protocol: 'ws',
        })) + `?agent_bridge_token=${encodeURIComponent(token)}`;

      const channel: CursorChannel = new SandboxChannel({
        connect: () => openWebSocket(wsUrl),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
        ...(respawnStrategy === 'replay'
          ? { initialLastSeenEventId: coords?.lastSeenEventId ?? 0 }
          : {}),
      });
      await channel.open(
        respawnStrategy === 'replay' ? { resume: true } : undefined,
      );

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        model: settings.model ?? DEFAULT_CURSOR_MODEL,
        autoReview,
        resumeAgentId: resumeAgentIdString,
        isResume: respawnStrategy !== undefined,
        seedResumeAgentOnFirstPrompt: respawnStrategy !== undefined,
        rerunContinue: respawnStrategy === 'rerun',
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        debug: startOpts.observability?.debug,
        permissionMode: startOpts.permissionMode,
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
    harnessId: 'cursor',
    message:
      'The cursor harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createCursor({ port })`.',
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
  } catch {}
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
  model,
  autoReview,
  resumeAgentId,
  isResume,
  seedResumeAgentOnFirstPrompt,
  rerunContinue,
  bridgePort,
  bridgeToken,
  sandboxId,
  debug,
  permissionMode,
}: {
  sessionId: string;
  channel: CursorChannel;
  proc: Experimental_SandboxProcess | undefined;
  model: string;
  autoReview: boolean;
  resumeAgentId: string | undefined;
  isResume: boolean;
  seedResumeAgentOnFirstPrompt: boolean;
  rerunContinue: boolean;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string;
  debug: HarnessV1DebugConfig | undefined;
  permissionMode: HarnessV1PermissionMode | undefined;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  let pendingResumeAgentId = seedResumeAgentOnFirstPrompt
    ? resumeAgentId
    : undefined;
  let instructionsApplied = isResume;
  let latestAgentId = resumeAgentId;

  channel.on('bridge-thread', msg => {
    latestAgentId = msg.threadId;
  });

  const wireTurn = (turnOpts: {
    emit: (event: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
  }): HarnessV1PromptControl => {
    let pendingResolve: (() => void) | undefined;
    let pendingReject: ((err: unknown) => void) | undefined;
    const done = new Promise<void>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });

    const unsubs: Array<() => void> = [];
    const forward = (event: HarnessV1StreamPart) => {
      try {
        turnOpts.emit(event);
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
      'tool-approval-request',
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
      unsubs.push(channel.on(type, msg => forward(msg)));
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

    const onClose = (_code?: number, reason?: string) => {
      if (isSettled) return;
      if (reason === 'suspended') {
        settleSuccess();
        return;
      }
      settleError(new Error('cursor bridge closed before the turn finished.'));
    };
    channel.onClose(onClose);

    const onAbort = () => {
      if (isSettled) return;
      try {
        channel.send({ type: 'abort' });
      } catch {}
      settleError(
        turnOpts.abortSignal?.reason ??
          new DOMException('Aborted', 'AbortError'),
      );
    };
    if (turnOpts.abortSignal) {
      if (turnOpts.abortSignal.aborted) {
        onAbort();
      } else {
        turnOpts.abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    return {
      submitToolResult: async input => {
        channel.send({
          type: 'tool-result',
          toolCallId: input.toolCallId,
          output: input.output,
          isError: input.isError,
        });
      },
      submitToolApproval: async input => {
        channel.send({
          type: 'tool-approval-response',
          approvalId: input.approvalId,
          approved: input.approved,
          reason: input.reason,
        });
      },
      submitUserMessage: async text => {
        channel.send({ type: 'user-message', text });
      },
      done,
    };
  };

  return {
    sessionId,
    isResume,
    modelId: model,
    doPromptTurn: async promptOpts => {
      const control = wireTurn({
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });

      const applyInstructions =
        !instructionsApplied && !!promptOpts.instructions;
      instructionsApplied = true;

      channel.send({
        type: 'start',
        prompt: extractUserText(promptOpts.prompt),
        ...(applyInstructions ? { instructions: promptOpts.instructions } : {}),
        tools: (promptOpts.tools ?? []).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        model,
        autoReview,
        ...(permissionMode ? { permissionMode } : {}),
        ...(pendingResumeAgentId
          ? { resumeAgentId: pendingResumeAgentId }
          : {}),
        ...(debug ? { debug } : {}),
      });
      pendingResumeAgentId = undefined;

      return control;
    },
    doContinueTurn: async continueOpts => {
      const control = wireTurn({
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });

      if (rerunContinue) {
        const agentId = pendingResumeAgentId ?? latestAgentId;
        pendingResumeAgentId = undefined;
        channel.send({
          type: 'start',
          prompt: 'Continue.',
          tools: (continueOpts.tools ?? []).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          model,
          autoReview,
          ...(permissionMode ? { permissionMode } : {}),
          ...(agentId ? { resumeAgentId: agentId } : {}),
          ...(debug ? { debug } : {}),
        });
      }

      return control;
    },
    doCompact: async () => {
      throw new HarnessCapabilityUnsupportedError({
        message: "Harness 'cursor' does not support manual compaction in v1.",
        harnessId: 'cursor',
      });
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `cursor session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'resume-session',
        harnessId: 'cursor',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestAgentId ? { agentId: latestAgentId } : {}),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            sandboxId,
          },
        },
      } satisfies HarnessV1ResumeSessionState;
    },
    doDestroy: async () => {
      if (stopped) return stopPromise;
      stopped = true;
      stopPromise = (async () => {
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
    doStop: async () => {
      if (stopped) {
        throw new Error(
          `cursor session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      channel.beginClose();
      const data: unknown = channel.isClosed()
        ? {}
        : await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              unsub();
              reject(
                new Error(
                  `cursor session ${sessionId} did not reply to detach within 5s.`,
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

      return {
        type: 'resume-session',
        harnessId: 'cursor',
        specificationVersion: 'harness-v1',
        data: (data ?? {}) as HarnessV1ResumeSessionState['data'],
      } satisfies HarnessV1ResumeSessionState;
    },
    doSuspendTurn: async () => {
      if (stopped) {
        throw new Error(
          `cursor session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'continue-turn',
        harnessId: 'cursor',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestAgentId ? { agentId: latestAgentId } : {}),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            sandboxId,
          },
        },
      } satisfies HarnessV1ContinueTurnState;
    },
  };
}

function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'cursor',
        message: `The cursor harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
