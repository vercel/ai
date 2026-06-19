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
  type HarnessV1ContinueTurnState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  markBridgeStarting,
  SandboxChannel,
  waitForBridgeReady,
} from '@ai-sdk/harness/utils';
import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod';
import {
  resolveDeepAgentsEnv,
  type DeepAgentsAuthOptions,
} from './deepagents-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './deepagents-bridge-protocol';

type DeepAgentsChannel = SandboxChannel<OutboundMessage, InboundMessage>;

// Pure derived state in /tmp; reinstalled per sandbox, persistence is the provider snapshot.
const BOOTSTRAP_DIR = '/tmp/harness/deepagents';

const DEEPAGENTS_DEFAULT_CONTEXT_WINDOW = 200_000;

// Live bridge coordinates returned by doDetach/doSuspendTurn so a later process can reattach.
const bridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});
const deepAgentsResumeStateSchema = z.object({
  bridge: bridgeCoordsSchema.optional(),
});
type DeepAgentsBridgeCoords = z.infer<typeof bridgeCoordsSchema>;

export type DeepAgentsHarnessSettings = {
  readonly auth?: DeepAgentsAuthOptions;
  /** Model id for the DeepAgents runtime, e.g. `claude-sonnet-4` (converted to `provider:model`). */
  readonly model?: string;
  /** Bridge port override; defaults to the sandbox's first declared port. */
  readonly port?: number;
  /** Maximum milliseconds to wait for the bridge to advertise its port. Defaults to 120000. */
  readonly startupTimeoutMs?: number;
};

// Native LangGraph tools keyed by cross-harness common name; `search`→`grep` (no `searchFiles` common name).
const DEEPAGENTS_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'read_file',
    toolUseKind: 'readonly',
    description: 'Read file contents',
    inputSchema: z.object({ file_path: z.string() }),
  }),
  write: commonTool('write', {
    nativeName: 'write_file',
    toolUseKind: 'edit',
    description: 'Write a file',
    inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  }),
  bash: commonTool('bash', {
    nativeName: 'shell',
    toolUseKind: 'bash',
    description: 'Execute a shell command',
    inputSchema: z.object({ command: z.string() }),
  }),
  grep: commonTool('grep', {
    nativeName: 'search',
    toolUseKind: 'readonly',
    description: 'Search file contents with regex',
    inputSchema: z.object({ pattern: z.string() }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

export function createDeepAgents(
  settings: DeepAgentsHarnessSettings = {},
): HarnessV1<typeof DEEPAGENTS_BUILTIN_TOOLS> {
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'deepagents',
    builtinTools: DEEPAGENTS_BUILTIN_TOOLS,
    // DeepAgents supports approvals upstream, but the happy-path first cut ships
    // with `permissionMode: 'allow-all'` only; approvals land in a follow-up.
    supportsBuiltinToolApprovals: false,
    lifecycleStateSchema: deepAgentsResumeStateSchema,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [bridge, pkg, lock] = await Promise.all([
        readBridgeAsset('index.mjs'),
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
      ]);
      cachedBootstrap = {
        harnessId: 'deepagents',
        bootstrapDir: BOOTSTRAP_DIR,
        files: [
          { path: `${BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
          { path: `${BOOTSTRAP_DIR}/package.json`, content: pkg },
          { path: `${BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
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
      if (
        startOpts.permissionMode != null &&
        startOpts.permissionMode !== 'allow-all'
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'deepagents' does not support built-in tool approval requests yet; use permissionMode: 'allow-all'.",
          harnessId: 'deepagents',
        });
      }

      const sandboxSession = startOpts.sandboxSession;
      const session = sandboxSession.restricted();
      const sandboxId = sandboxSession.id;

      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const isResume = lifecycleState != null;
      const isContinue = startOpts.continueFrom != null;
      const coords =
        isResume && typeof lifecycleState?.data === 'object'
          ? (lifecycleState.data as { bridge?: DeepAgentsBridgeCoords }).bridge
          : undefined;

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

      // Attach: reopen a socket to the still-running bridge. A between-turn
      // resume attaches plainly; a suspended in-flight turn (continueFrom)
      // replays past the cursor. If the bridge is gone the open throws and we
      // fall through to a fresh spawn.
      if (coords) {
        try {
          const attachUrl =
            (await sandboxSession.getPortUrl({
              port: coords.port,
              protocol: 'ws',
            })) + `?agent_bridge_token=${encodeURIComponent(coords.token)}`;
          const attachChannel: DeepAgentsChannel = new SandboxChannel({
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
            model: settings.model,
            bridgePort: coords.port,
            bridgeToken: coords.token,
            sandboxId,
            isResume: true,
          });
        } catch {
          // Bridge no longer reachable — recover by respawning below.
        }
      }

      const port = resolveBridgePort(sandboxSession, settings.port);
      const token = randomBytes(32).toString('hex');

      // DeepAgents reads skills from a single combined `.skills.md` file in the
      // working directory.
      if (startOpts.skills && startOpts.skills.length > 0) {
        await writeSkills({
          sandbox: session,
          workDir,
          skills: startOpts.skills,
          abortSignal: startOpts.abortSignal,
        });
      }

      const env = {
        ...resolveDeepAgentsEnv(settings.auth),
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
        bridgeType: 'deepagents',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await session.spawn({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --bootstrap-dir ${shellQuote(BOOTSTRAP_DIR)}`,
        env,
        abortSignal: startOpts.abortSignal,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: session,
        bridgeStateDir,
        bridgeType: 'deepagents',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: () =>
          new Error('deepagents bridge did not become ready in time.'),
        createExitError: () =>
          new Error('deepagents bridge exited before becoming ready.'),
      });
      void forwardBridgeStderr(proc.stderr);

      const wsUrl =
        (await sandboxSession.getPortUrl({
          port: boundPort,
          protocol: 'ws',
        })) + `?agent_bridge_token=${encodeURIComponent(token)}`;

      const channel: DeepAgentsChannel = new SandboxChannel({
        connect: () => openWebSocket(wsUrl),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
      });
      await channel.open();

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        model: settings.model,
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        isResume,
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
    harnessId: 'deepagents',
    message:
      'The deepagents harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createDeepAgents({ port })`.',
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

async function writeSkills({
  sandbox,
  workDir,
  skills,
  abortSignal,
}: {
  sandbox: ReturnType<HarnessV1NetworkSandboxSession['restricted']>;
  workDir: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const combined = skills
    .map(skill => `## ${skill.name}\n${skill.description}\n\n${skill.content}`)
    .join('\n\n---\n\n');
  await sandbox.writeTextFile({
    path: `${workDir}/.skills.md`,
    content: combined,
    abortSignal,
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

function createSession({
  sessionId,
  channel,
  proc,
  model,
  bridgePort,
  bridgeToken,
  sandboxId,
  isResume,
}: {
  sessionId: string;
  channel: DeepAgentsChannel;
  // Undefined on attach — the live bridge was spawned by another process.
  proc: Experimental_SandboxProcess | undefined;
  model: string | undefined;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string;
  isResume: boolean;
}): HarnessV1Session {
  let stopped = false;
  // A resumed session already applied its instructions in the original first message.
  let instructionsApplied = isResume;

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

    const onClose = () => {
      if (isSettled) return;
      settleError(
        new Error('deepagents bridge closed before the turn finished.'),
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
      submitUserMessage: async text => {
        channel.send({ type: 'user-message', text });
      },
      done,
    };
  };

  const unsupported = (capability: string): never => {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'deepagents',
      message: `Harness 'deepagents' does not support ${capability} yet.`,
    });
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
        ...(model ? { model } : {}),
      });

      return control;
    },
    doContinueTurn: async continueOpts => {
      // Attach/replay: doStart reopened the channel with `{ resume: true }`, so
      // the bridge replays everything past the cursor (incl. a `finish` if the
      // turn ended during the gap). No `start` is sent — issuing one would clear
      // the replay log and begin a new turn.
      return wireTurn({
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });
    },
    doSuspendTurn: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      stopped = true;
      // Freeze the active turn at the cursor, leaving the bridge running so the
      // next slice replays the tail.
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ContinueTurnState = {
        type: 'continue-turn',
        harnessId: 'deepagents',
        specificationVersion: 'harness-v1',
        data: {
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            sandboxId,
          },
        },
      };
      return payload;
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      // Park between turns: close the host socket but leave the bridge running
      // so a future process reattaches via these coordinates.
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'deepagents',
        specificationVersion: 'harness-v1',
        data: {
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            sandboxId,
          },
        },
      };
      return payload;
    },
    doCompact: async () => unsupported('manual compaction'),
    doStop: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      await teardown(channel, proc);
      // Conversation state is in-memory; tearing the bridge down loses it. The
      // sandbox snapshot preserves the filesystem, so the next session resumes
      // the workspace but not the prior conversation.
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'deepagents',
        specificationVersion: 'harness-v1',
        data: {},
      };
      return payload;
    },
    doDestroy: async () => {
      if (stopped) return;
      stopped = true;
      await teardown(channel, proc);
    },
  };
}

async function teardown(
  channel: DeepAgentsChannel,
  proc: Experimental_SandboxProcess | undefined,
): Promise<void> {
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
}

// Reduce the prompt to plain user text; non-text parts are unsupported.
function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'deepagents',
        message: `The deepagents harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}

export { DEEPAGENTS_BUILTIN_TOOLS, DEEPAGENTS_DEFAULT_CONTEXT_WINDOW };
