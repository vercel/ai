import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1BuiltinToolDescriptor,
  type HarnessV1PromptControl,
  type HarnessV1SandboxHandle,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  safeParseJSON,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { resolveCodexEnv, type CodexAuthOptions } from './codex-auth';
import { BridgeChannel } from './codex-bridge-channel';
import { bridgeReadySchema } from './codex-bridge-protocol';
import type { CodexSkill } from './codex-skills';
import { translate } from './codex-translate';

export type CodexHarnessSettings = {
  readonly auth?: CodexAuthOptions;
  /**
   * Skills made available to the model. Unlike the `claude` CLI, the
   * `codex` CLI does not auto-discover a skills directory — every supplied
   * skill is injected inline into the user prompt on every turn.
   */
  readonly skills?: ReadonlyArray<CodexSkill>;
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

const BUILTIN_TOOLS: ReadonlyArray<HarnessV1BuiltinToolDescriptor> = [
  { nativeName: 'shell', commonName: 'bash' },
  { nativeName: 'file_edit', commonName: 'edit' },
  { nativeName: 'web_search', commonName: 'webSearch' },
  { nativeName: 'todo_list', commonName: 'todoList' },
];

const BOOTSTRAP_DIR = '/tmp/harness/codex';
const SESSION_DIR_PREFIX = '/tmp/harness/sessions/codex';

export function createCodex(settings: CodexHarnessSettings = {}): HarnessV1 {
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'codex',
    builtinTools: BUILTIN_TOOLS,
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

      const sessionDir = `${SESSION_DIR_PREFIX}/${startOpts.sessionId}`;
      const port = resolveBridgePort(handle, settings.port);
      const token = randomBytes(32).toString('hex');
      const env = {
        ...resolveCodexEnv(settings.auth),
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
      };

      await session.run({
        command: `mkdir -p ${sessionDir}`,
        abortSignal: startOpts.abortSignal,
      });

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
        skills: settings.skills,
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
}: {
  sessionId: string;
  channel: BridgeChannel;
  proc: Experimental_SandboxProcess;
  skills: ReadonlyArray<CodexSkill> | undefined;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;

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

      channel.send({
        type: 'start',
        promptMessages: promptOpts.prompt as unknown[],
        instructions: promptOpts.instructions,
        tools: (promptOpts.tools ?? []).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        activeBuiltinTools: promptOpts.activeBuiltinTools as
          | string[]
          | undefined,
        harnessOptions: promptOpts.harnessOptions as
          | Record<string, unknown>
          | undefined,
        ...(skills && skills.length > 0
          ? {
              skills: skills.map(s => ({
                name: s.name,
                description: s.description,
                content: s.content,
              })),
            }
          : {}),
      });

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
  };
}
