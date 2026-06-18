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

/*
 * Bootstrap lives in /tmp because it's pure derived state — the harness can
 * reinstall the bridge's Node deps and files on any fresh sandbox from the
 * recipe. Persistence comes from the sandbox provider's snapshot, not the path.
 */
const BOOTSTRAP_DIR = '/tmp/harness/deepagents';

const DEEPAGENTS_DEFAULT_CONTEXT_WINDOW = 200_000;

export type DeepAgentsHarnessSettings = {
  readonly auth?: DeepAgentsAuthOptions;
  /**
   * Model id the underlying DeepAgents (LangChain) runtime should use, e.g.
   * `claude-sonnet-4`. The bridge converts this to LangChain colon format
   * internally (`anthropic:claude-sonnet-4`).
   */
  readonly model?: string;
  /**
   * Override the port the bridge binds inside the sandbox. By default the
   * adapter uses the first port the sandbox declares via `sandbox.ports`.
   */
  readonly port?: number;
  /** Maximum milliseconds to wait for the bridge to advertise its port. Defaults to 120000. */
  readonly startupTimeoutMs?: number;
};

/*
 * Every native tool the DeepAgents (LangGraph) runtime exposes as a
 * model-callable tool, keyed by the cross-harness common name the bridge emits
 * as `toolName` on the wire. The native LangGraph names are recorded via
 * `nativeName`. DeepAgents' `search` maps to the common `grep` capability —
 * `/ai` has no `searchFiles` common name — and the bridge maps each tool's
 * native argument names (`path`/`query`) onto the standard common fields
 * (`file_path`/`pattern`).
 */
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

      // Happy-path first cut: cross-process resume / turn continuation is a
      // follow-up. DeepAgents' conversation state is in-memory (LangGraph
      // MemorySaver) and does not survive a bridge restart, so resuming a prior
      // session is not yet sound.
      if (startOpts.resumeFrom != null || startOpts.continueFrom != null) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'deepagents' does not support resuming a session yet; start a fresh session.",
          harnessId: 'deepagents',
        });
      }

      const sandboxSession = startOpts.sandboxSession;
      const session = sandboxSession.restricted();

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
        command: `mkdir -p ${workDir} ${bridgeStateDir}`,
        abortSignal: startOpts.abortSignal,
      });

      await markBridgeStarting({
        sandbox: session,
        bridgeStateDir,
        bridgeType: 'deepagents',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await session.spawn({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${workDir} --bridge-state-dir ${bridgeStateDir} --bootstrap-dir ${BOOTSTRAP_DIR}`,
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
}: {
  sessionId: string;
  channel: DeepAgentsChannel;
  proc: Experimental_SandboxProcess;
  model: string | undefined;
}): HarnessV1Session {
  let stopped = false;
  let instructionsApplied = false;

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
    isResume: false,
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
    doContinueTurn: async () => unsupported('turn continuation'),
    doSuspendTurn: async () => unsupported('suspending a turn'),
    doDetach: async () => unsupported('detaching a session'),
    doCompact: async () => unsupported('manual compaction'),
    doStop: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      await teardown(channel, proc);
      // DeepAgents holds conversation state in memory only, so there is no
      // durable runtime state to export. The sandbox snapshot taken during the
      // subsequent `sandboxSession.stop()` preserves the filesystem.
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
  proc: Experimental_SandboxProcess,
): Promise<void> {
  channel.beginClose();
  try {
    if (!channel.isClosed()) {
      channel.send({ type: 'shutdown' });
    }
  } catch {}
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      proc.wait(),
      new Promise<void>(resolve => {
        stopTimer = setTimeout(resolve, 5000);
        stopTimer.unref?.();
      }),
    ]);
  } finally {
    if (stopTimer) clearTimeout(stopTimer);
    try {
      await proc.kill();
    } catch {}
    channel.close();
  }
}

/*
 * Reduce a `HarnessV1Prompt` to the plain user text the bridge forwards to the
 * DeepAgents runtime. File and image parts are not yet supported — throw rather
 * than silently drop them.
 */
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
