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
import {
  resolveClaudeCodeEnv,
  type ClaudeCodeAuthOptions,
} from './claude-code-auth';
import { BridgeChannel } from './claude-code-bridge-channel';
import { bridgeReadySchema } from './claude-code-bridge-protocol';
import { writeSkills, type ClaudeCodeSkill } from './claude-code-skills';
import { translate } from './claude-code-translate';

export type ClaudeCodeHarnessSettings = {
  readonly auth?: ClaudeCodeAuthOptions;
  readonly skills?: ReadonlyArray<ClaudeCodeSkill>;
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
  { nativeName: 'Read', commonName: 'read' },
  { nativeName: 'Write', commonName: 'write' },
  { nativeName: 'Edit', commonName: 'edit' },
  { nativeName: 'Bash', commonName: 'bash' },
  { nativeName: 'Glob', commonName: 'glob' },
  { nativeName: 'Grep', commonName: 'grep' },
];

const BOOTSTRAP_DIR = '/tmp/harness/claude-code';
const SESSION_DIR_PREFIX = '/tmp/harness/sessions/claude-code';

export function createClaudeCode(
  settings: ClaudeCodeHarnessSettings = {},
): HarnessV1 {
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'claude-code',
    builtinTools: BUILTIN_TOOLS,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [pkg, lock, bridge] = await Promise.all([
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
        readBridgeAsset('index.mjs'),
      ]);
      cachedBootstrap = {
        harnessId: 'claude-code',
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
            command: `cd ${BOOTSTRAP_DIR} && if [ -f node_modules/@anthropic-ai/claude-code/install.cjs ]; then node node_modules/@anthropic-ai/claude-code/install.cjs; fi && ./node_modules/.bin/claude --version`,
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
        ...resolveClaudeCodeEnv(settings.auth),
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
      };

      await session.runCommand({
        command: `mkdir -p ${sessionDir}`,
        abortSignal: startOpts.abortSignal,
      });

      await session.writeTextFile({
        path: `${sessionDir}/env.json`,
        content: JSON.stringify(env),
        abortSignal: startOpts.abortSignal,
      });

      if (settings.skills && settings.skills.length > 0) {
        await writeSkills({
          sandbox: session,
          workdir: sessionDir,
          skills: settings.skills,
          abortSignal: startOpts.abortSignal,
        });
      }

      const proc = await session.spawnCommand({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${sessionDir}`,
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

      return createSession({ sessionId: startOpts.sessionId, channel, proc });
    },
  };
}

function requireHandle(
  handle: HarnessV1SandboxHandle | undefined,
): HarnessV1SandboxHandle {
  if (!handle) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'claude-code',
      message:
        'The claude-code harness requires a sandbox provider. Pass `sandbox` to the HarnessAgent constructor.',
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
    harnessId: 'claude-code',
    message:
      'The claude-code harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createClaudeCode({ port })`.',
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
        throw new Error('claude-code bridge did not become ready in time.');
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
        throw new Error('claude-code bridge exited before becoming ready.');
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
}: {
  sessionId: string;
  channel: BridgeChannel;
  proc: Experimental_SandboxProcess;
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
            new Error('claude-code bridge closed before the turn finished.'),
          );
        }
      };
      channel.onClose(onClose);

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
