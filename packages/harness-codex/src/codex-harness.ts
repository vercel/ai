import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1BuiltinTool,
  type HarnessV1PromptControl,
  type HarnessV1ResumeState,
  type HarnessV1SandboxHandle,
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
import { BridgeChannel } from './codex-bridge-channel';
import { bridgeReadySchema } from './codex-bridge-protocol';
import { translate } from './codex-translate';

export type CodexHarnessSettings = {
  readonly auth?: CodexAuthOptions;
  /**
   * OpenAI model id the underlying `codex` CLI should use. Leaving this
   * unset defers to the CLI's default.
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

const BOOTSTRAP_DIR = '/tmp/harness/codex';
const SESSION_DIR_PREFIX = '/tmp/harness/sessions/codex';

/**
 * Schema for the adapter-specific `HarnessV1ResumeState.data` payload Codex
 * produces. The `threadId` is what `codex.resumeThread(...)` requires; the
 * sandbox lookup is handled separately via `provider.resume({ sessionId })`.
 */
const codexResumeStateSchema = z.object({
  threadId: z.string().optional(),
});

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
      const handle = requireHandle(startOpts.sandboxHandle);
      const { session } = handle;
      const isResume = startOpts.resumeFrom != null;
      const resumeThreadId =
        isResume && typeof startOpts.resumeFrom?.data === 'object'
          ? (startOpts.resumeFrom.data as { threadId?: unknown }).threadId
          : undefined;
      const resumeThreadIdString =
        typeof resumeThreadId === 'string' && resumeThreadId.length > 0
          ? resumeThreadId
          : undefined;

      const sessionDir = `${SESSION_DIR_PREFIX}/${startOpts.sessionId}`;
      const port = resolveBridgePort(handle, settings.port);
      const token = randomBytes(32).toString('hex');
      const env = {
        ...resolveCodexEnv(settings.auth),
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
      };

      if (!isResume) {
        await session.run({
          command: `mkdir -p ${sessionDir}`,
          abortSignal: startOpts.abortSignal,
        });
      }

      // Always refresh env.json — the bridge process is brand new (whether
      // first start or resume), so it needs the current token + port. The
      // session dir already exists across the snapshot/resume cycle.
      await session.writeTextFile({
        path: `${sessionDir}/env.json`,
        content: JSON.stringify(env),
        abortSignal: startOpts.abortSignal,
      });

      const proc = await session.spawn({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${sessionDir} --bootstrap-dir ${BOOTSTRAP_DIR}`,
        abortSignal: startOpts.abortSignal,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        timeoutMs: settings.startupTimeoutMs ?? 120_000,
        abortSignal: startOpts.abortSignal,
      });

      const wsUrl =
        (await handle.getPortUrl({ port: boundPort, protocol: 'ws' })) +
        `?agent_bridge_token=${encodeURIComponent(token)}`;

      const ws = await openWebSocket(wsUrl);
      const channel = new BridgeChannel(ws);

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        skills: startOpts.skills,
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        webSearch: settings.webSearch,
        resumeThreadId: resumeThreadIdString,
      });
    },
  };
}

function requireHandle(
  handle: HarnessV1SandboxHandle | undefined,
): HarnessV1SandboxHandle {
  if (!handle) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'codex',
      message:
        'The codex harness requires a sandbox provider. Pass `sandbox` to the HarnessAgent constructor.',
    });
  }
  return handle;
}

function resolveBridgePort(
  handle: HarnessV1SandboxHandle,
  override: number | undefined,
): number {
  if (override !== undefined) return override;
  if (handle.ports.length > 0) return handle.ports[0];
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
    void drainRest(proc.stderr);
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
}: {
  sessionId: string;
  channel: BridgeChannel;
  proc: Experimental_SandboxProcess;
  skills: ReadonlyArray<HarnessV1Skill> | undefined;
  model: string | undefined;
  reasoningEffort: 'low' | 'medium' | 'high' | undefined;
  webSearch: boolean | undefined;
  resumeThreadId: string | undefined;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  // Sent once on the first prompt after a cross-process resume so the
  // bridge takes the `codex.resumeThread(...)` branch. Cleared after the
  // first send — subsequent turns within this bridge process use the
  // bridge-cached threadState.
  let pendingResumeThreadId = resumeThreadId;

  return {
    sessionId,
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
            forward(translate(msg));
          }),
        );
      }
      unsubs.push(
        channel.on('finish', msg => {
          forward(translate(msg));
          settleSuccess();
        }),
      );
      unsubs.push(
        channel.on('error', msg => {
          forward(translate(msg));
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

      const startMessage = {
        type: 'start' as const,
        promptMessages: promptOpts.prompt as unknown[],
        instructions: promptOpts.instructions,
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
      const data = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsub();
          reject(
            new Error(
              `codex session ${sessionId} did not reply to detach within 5s.`,
            ),
          );
        }, 5000);
        timer.unref?.();
        const unsub = channel.on('detach-state', msg => {
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

      const payload: HarnessV1ResumeState = {
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: (data ?? {}) as HarnessV1ResumeState['data'],
      };
      return payload;
    },
  };
}
