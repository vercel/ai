import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1BuiltinTool,
  type HarnessV1BuiltinToolName,
  type HarnessV1DebugConfig,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PermissionMode,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  markBridgeStarting,
  SandboxChannel,
  waitForBridgeReady,
} from '@ai-sdk/harness/utils';
import { type Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod';
import {
  resolveGrokBuildEnv,
  toGrokCliEnv,
  type GrokBuildAuthOptions,
} from './grok-build-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './grok-build-bridge-protocol';

type GrokBuildChannel = SandboxChannel<OutboundMessage, InboundMessage>;

// Native tool name → common name. Placeholder names; reconcile with real CLI output.
export const NATIVE_TO_COMMON: Readonly<
  Record<string, HarnessV1BuiltinToolName>
> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Glob: 'glob',
  Grep: 'grep',
  WebSearch: 'webSearch',
};

export function toCommonName(
  nativeName: string,
): HarnessV1BuiltinToolName | string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

// Builtin tools, keyed by common name. Placeholder names/schemas; reconcile with real CLI output.
export const GROK_BUILD_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'Read',
    toolUseKind: 'readonly',
    description: 'Read file contents (text, image, PDF, notebook)',
    inputSchema: z.object({
      file_path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
      pages: z.string().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'Write',
    toolUseKind: 'edit',
    description: 'Overwrite or create a file at an absolute path',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'Edit',
    toolUseKind: 'edit',
    description: 'Edit a file by exact string replacement',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'Bash',
    toolUseKind: 'bash',
    description: 'Execute a shell command',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
      description: z.string().optional(),
      run_in_background: z.boolean().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'Glob',
    toolUseKind: 'readonly',
    description: 'Fast file-pattern search using glob syntax',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'Grep',
    toolUseKind: 'readonly',
    description: 'Regex search over file contents',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'WebSearch',
    toolUseKind: 'readonly',
    description: 'Issue web search queries',
    inputSchema: z.object({
      query: z.string(),
      allowed_domains: z.array(z.string()).optional(),
      blocked_domains: z.array(z.string()).optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

const BOOTSTRAP_DIR = '/tmp/harness/grok-build';

// Direct (xAI) uses the bare id; the gateway requires the `xai/` prefix.
const DEFAULT_GROK_MODEL_DIRECT = 'grok-build-0.1';
const DEFAULT_GROK_MODEL_GATEWAY = 'xai/grok-build-0.1';

export type GrokBuildHarnessSettings = {
  readonly model?: string;
  readonly planMode?: boolean;
  readonly auth?: GrokBuildAuthOptions;
  readonly port?: number;
  /** Maximum milliseconds to wait for the bridge to advertise its port. Defaults to 120000. */
  readonly startupTimeoutMs?: number;
};

// `sessionId` (from the `end` event) feeds `-r/--resume`; `bridge` carries attach coords.
const lifecycleStateSchema = z.object({
  sessionId: z.string().optional(),
  bridge: z
    .object({
      port: z.number(),
      token: z.string(),
      lastSeenEventId: z.number(),
      sandboxId: z.string().optional(),
    })
    .optional(),
});

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

export function createGrokBuild(
  settings: GrokBuildHarnessSettings = {},
): HarnessV1<typeof GROK_BUILD_BUILTIN_TOOLS> {
  // Per-instance cache (in the closure, not module scope, to avoid cross-instance leakage).
  let cachedBootstrap: HarnessV1Bootstrap | null = null;
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'grok-build',
    builtinTools: GROK_BUILD_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: false,
    lifecycleStateSchema,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [pkg, lock, bridge] = await Promise.all([
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
        readBridgeAsset('index.mjs'),
      ]);
      cachedBootstrap = {
        harnessId: 'grok-build',
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
          {
            command: `cd ${BOOTSTRAP_DIR} && ./node_modules/.bin/grok --version`,
          },
        ],
      };
      return cachedBootstrap;
    },
    doStart: async startOpts => {
      if (
        startOpts.permissionMode != null &&
        startOpts.permissionMode !== 'allow-all'
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'grok-build' does not support built-in tool approval requests; use permissionMode: 'allow-all'. The grok CLI runs with --always-approve and executes tools itself.",
          harnessId: 'grok-build',
        });
      }

      const sandboxSession = startOpts.sandboxSession;
      const session = sandboxSession.restricted();
      const sandboxId = sandboxSession.id;
      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const isResume = lifecycleState != null;
      const resumeData =
        isResume && typeof lifecycleState?.data === 'object'
          ? (lifecycleState.data as {
              sessionId?: unknown;
            })
          : undefined;
      const resumeSessionId =
        typeof resumeData?.sessionId === 'string' &&
        resumeData.sessionId.length > 0
          ? resumeData.sessionId
          : undefined;

      const workDir = startOpts.sessionWorkDir;
      const sessionDataDir = `${sandboxSession.defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const timeoutMs = settings.startupTimeoutMs ?? 120_000;

      // Normalize forwarded bridge diagnostics frames and report them.
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

      // Resolve auth → concrete grok CLI env vars, and pick the matching model id.
      const resolvedAuth = resolveGrokBuildEnv(settings.auth);
      const grokEnv = toGrokCliEnv(resolvedAuth);
      const isGateway = resolvedAuth.AI_GATEWAY_API_KEY != null;
      const model =
        settings.model ??
        (isGateway ? DEFAULT_GROK_MODEL_GATEWAY : DEFAULT_GROK_MODEL_DIRECT);

      const port = resolveBridgePort(sandboxSession, settings.port);
      const token = randomBytes(32).toString('hex');
      const env = {
        ...grokEnv,
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
      };

      await session.run({
        command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
        abortSignal: startOpts.abortSignal,
      });

      await markBridgeStarting({
        sandbox: session,
        bridgeStateDir,
        bridgeType: 'grok-build',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await session.spawn({
        command: `node ${shellQuote(`${BOOTSTRAP_DIR}/bridge.mjs`)} --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --bootstrap-dir ${shellQuote(BOOTSTRAP_DIR)}`,
        env,
        abortSignal: startOpts.abortSignal,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: session,
        bridgeStateDir,
        bridgeType: 'grok-build',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: () =>
          new Error('grok-build bridge did not become ready in time.'),
        createExitError: () =>
          new Error('grok-build bridge exited before becoming ready.'),
      });
      void drainRest(proc.stdout);
      void forwardBridgeStderr(proc.stderr, startOpts.observability?.debug);

      const wsUrl =
        (await sandboxSession.getPortUrl({
          port: boundPort,
          protocol: 'ws',
        })) + `?agent_bridge_token=${encodeURIComponent(token)}`;

      const channel: GrokBuildChannel = new SandboxChannel({
        connect: () => openWebSocket(wsUrl),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
      });
      await channel.open();

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        model,
        isResume,
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        debug: startOpts.observability?.debug,
        permissionMode: startOpts.permissionMode,
        resumeGrokSessionId: resumeSessionId,
      });
    },
  };
}

// Single-quote a value for safe use in a POSIX shell command
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveBridgePort(
  sandboxSession: HarnessV1NetworkSandboxSession,
  override: number | undefined,
): number {
  if (override !== undefined) return override;
  if (sandboxSession.ports.length > 0) return sandboxSession.ports[0];
  throw new HarnessCapabilityUnsupportedError({
    harnessId: 'grok-build',
    message:
      'The grok-build harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createGrokBuild({ port })`.',
  });
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

// Live-forward bridge stderr to the terminal only under debug. grok logs
// recoverable errors (e.g. a spurious `grok-build` model probe that 404s) to
// stderr mid-turn; printing those by default paints over TUI consumers. Fatal
// exits still surface their stderr tail via the bridge's close handler.
async function forwardBridgeStderr(
  stream: ReadableStream<Uint8Array>,
  debug: HarnessV1DebugConfig | undefined,
): Promise<void> {
  if (debug?.enabled !== true) return;
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

function createSession({
  sessionId,
  channel,
  proc,
  model,
  isResume,
  bridgePort,
  bridgeToken,
  sandboxId,
  debug,
  permissionMode,
  resumeGrokSessionId,
}: {
  sessionId: string;
  channel: GrokBuildChannel;
  /** Undefined on `attach` — the live bridge was spawned by another process. */
  proc: Experimental_SandboxProcess | undefined;
  model: string | undefined;
  isResume: boolean;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string;
  debug: HarnessV1DebugConfig | undefined;
  permissionMode: HarnessV1PermissionMode | undefined;
  resumeGrokSessionId: string | undefined;
}): HarnessV1Session {
  void debug;
  void permissionMode;
  let stopped = false;
  let stopPromise: Promise<void> | undefined;

  // Latest grok CLI session id; seeded from lifecycle state so detach/stop have an id pre-turn.
  let latestGrokSessionId = resumeGrokSessionId;

  // On a resumed session, the first prompt must continue the prior grok thread.
  let continueOnNextPrompt = isResume;
  // Session-level instructions are applied once, on the first fresh-session prompt.
  let instructionsApplied = false;

  // Wire the channel into one turn and return the control surface (shared by prompt/continue).
  const wireTurn = (turnOpts: {
    emit: (event: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
  }): { done: Promise<void> } => {
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
      settleError(
        new Error('grok-build bridge closed before the turn finished.'),
      );
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
        turnOpts.abortSignal.addEventListener('abort', onAbort, {
          once: true,
        });
      }
    }

    return { done };
  };

  // grok self-executes tools (`--always-approve`); these are unsupported no-ops.
  const unsupportedToolControl = {
    submitToolResult: async () => {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'grok-build',
        message:
          'The grok-build harness executes tools inside the CLI (--always-approve); host tool results are not accepted.',
      });
    },
    submitToolApproval: async () => {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'grok-build',
        message:
          'The grok-build harness executes tools inside the CLI (--always-approve); host tool approvals are not accepted.',
      });
    },
  };

  return {
    sessionId,
    isResume,
    modelId: model,
    doPromptTurn: async promptOpts => {
      const { done } = wireTurn({
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });
      let prompt = extractUserText(promptOpts.prompt);
      // Apply session instructions once, on the first prompt of a fresh session.
      if (promptOpts.instructions && !instructionsApplied && !isResume) {
        prompt = `${promptOpts.instructions}\n\n${prompt}`;
      }
      instructionsApplied = true;
      const shouldContinue = continueOnNextPrompt;
      continueOnNextPrompt = false;
      channel.send({
        type: 'start',
        prompt,
        ...(model ? { model } : {}),
        ...(shouldContinue ? { continue: true } : {}),
      });
      return { ...unsupportedToolControl, done };
    },
    doContinueTurn: async continueOpts => {
      const { done } = wireTurn({
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });
      // No prompt on continue, but grok `-p` requires one — send a nudge with `-c`.
      channel.send({
        type: 'start',
        prompt: 'Continue.',
        ...(model ? { model } : {}),
        continue: true,
      });
      return { ...unsupportedToolControl, done };
    },
    doCompact: async () => {
      throw new HarnessCapabilityUnsupportedError({
        message: "Harness 'grok-build' does not support manual compaction.",
        harnessId: 'grok-build',
      });
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `grok-build session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'resume-session',
        harnessId: 'grok-build',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestGrokSessionId ? { sessionId: latestGrokSessionId } : {}),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            sandboxId,
          },
        },
      } satisfies HarnessV1ResumeSessionState;
    },
    doStop: async () => {
      if (stopped) {
        throw new Error(
          `grok-build session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      channel.beginClose();
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
        harnessId: 'grok-build',
        specificationVersion: 'harness-v1',
        data: latestGrokSessionId ? { sessionId: latestGrokSessionId } : {},
      } satisfies HarnessV1ResumeSessionState;
    },
    doSuspendTurn: async () => {
      if (stopped) {
        throw new Error(
          `grok-build session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'continue-turn',
        harnessId: 'grok-build',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestGrokSessionId ? { sessionId: latestGrokSessionId } : {}),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            sandboxId,
          },
        },
      };
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
  };
}

// Reduce a prompt to plain text for grok `-p`. File/image parts are unsupported — throw.
function extractUserText(
  prompt: Parameters<HarnessV1Session['doPromptTurn']>[0]['prompt'],
): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'grok-build',
        message: `The grok-build harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
