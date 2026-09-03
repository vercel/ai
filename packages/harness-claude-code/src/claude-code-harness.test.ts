import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentMessages: Array<Record<string, unknown>> = [];
const openCalls: Array<{ resume?: boolean } | undefined> = [];
let connectOnOpen = false;

const wsMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const sockets: FakeWebSocket[] = [];
  const scripts: Array<(socket: FakeWebSocket) => void> = [];
  const unhandledErrors: unknown[] = [];

  class FakeWebSocket {
    readonly url: string;
    readonly headers: Record<string, string> | undefined;
    readonly handlers = new Map<string, Set<Handler>>();
    closed = false;
    terminated = false;
    emitErrorOnTerminate = false;

    constructor(url: string, options?: { headers?: Record<string, string> }) {
      this.url = url;
      this.headers = options?.headers;
      sockets.push(this);
      scripts.shift()?.(this);
    }

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? new Set<Handler>();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    off(event: string, handler: Handler): this {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      const handlers = this.handlers.get(event) ?? new Set<Handler>();
      if (event === 'error' && handlers.size === 0) {
        unhandledErrors.push(args[0]);
        return;
      }
      for (const handler of handlers) {
        handler(...args);
      }
    }

    close(): void {
      this.closed = true;
      this.emit('close');
    }

    terminate(): void {
      this.terminated = true;
      if (this.emitErrorOnTerminate) {
        queueMicrotask(() => {
          this.emit(
            'error',
            new Error(
              'WebSocket was closed before the connection was established',
            ),
          );
          this.close();
        });
      }
    }
  }

  return {
    FakeWebSocket,
    sockets,
    scripts,
    unhandledErrors,
    reset: () => {
      sockets.length = 0;
      scripts.length = 0;
      unhandledErrors.length = 0;
    },
  };
});

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    private readonly connect: () => Promise<unknown>;

    constructor({ connect }: { connect: () => Promise<unknown> }) {
      this.connect = connect;
    }

    async open(opts?: { resume?: boolean }): Promise<void> {
      openCalls.push(opts);
      if (connectOnOpen) {
        await this.connect();
      }
    }
    on(): () => void {
      return () => {};
    }
    onReconnect(): () => void {
      return () => {};
    }
    onClose(): void {}
    send(msg: Record<string, unknown>): void {
      sentMessages.push(msg);
    }
    beginClose(): void {}
    isClosed(): boolean {
      return false;
    }
    suspend(): Promise<number> {
      return Promise.resolve(0);
    }
    close(): void {}
  }
  return { ...actual, SandboxChannel: FakeSandboxChannel };
});

vi.mock('ws', () => ({ WebSocket: wsMock.FakeWebSocket }));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const path = typeof input === 'string' ? input : String(input);
      if (path.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (path.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (path.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      if (path.endsWith('/bridge/pnpm-workspace.yaml'))
        return "allowBuilds:\n  '@anthropic-ai/claude-code@2.1.213': true\n";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFile as any)(input, ...rest);
    }),
  };
});

// eslint-disable-next-line import/first
import { createClaudeCode } from './claude-code-harness';

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) {
        controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}

function fakeNetworkSandboxSessionForStartupFailure({
  stdout,
  stderr,
  exitCode = 1,
}: {
  stdout: string;
  stderr: string;
  exitCode?: number;
}): HarnessV1NetworkSandboxSession {
  const port = 4319;
  const session = {
    run: async ({ command }: { command: string }) => ({
      exitCode: 0,
      stdout: command === 'printf "%s" "$HOME"' ? '/home/vercel-sandbox' : '',
      stderr: '',
    }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async () => ({
      stdout: textStream(stdout),
      stderr: textStream(stderr),
      kill: async () => {},
      wait: async () => ({ exitCode }),
    }),
  };
  return {
    id: 'test-sandbox',
    defaultWorkingDirectory: '/vercel/sandbox',
    restricted: () => session,
    ports: [port],
    async getPortEndpoint() {
      return { url: `ws://127.0.0.1:${port}` };
    },
    async getPortUrl() {
      return `ws://127.0.0.1:${port}`;
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

function fakeNetworkSandboxSessionForStartupSuccess({
  bridgePortUrl,
  bridgePortHeaders,
  spawns,
  spawnEnvs,
  writes,
  runs,
}: {
  bridgePortUrl: string;
  bridgePortHeaders?: Readonly<Record<string, string>>;
  spawns?: string[];
  spawnEnvs?: Array<Record<string, string | undefined>>;
  writes: Array<{ path: string; content: string }>;
  runs: string[];
}): HarnessV1NetworkSandboxSession {
  const session = {
    run: async ({ command }: { command: string }) => {
      runs.push(command);
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/vercel-sandbox', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    readTextFile: async () => null,
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      writes.push({ path, content });
    },
    spawn: async ({
      command,
      env,
    }: {
      command: string;
      env?: Record<string, string | undefined>;
    }) => {
      spawns?.push(command);
      if (env) spawnEnvs?.push(env);
      return {
        stdout: textStream('{"type":"bridge-ready","port":4319}\n'),
        stderr: textStream(''),
        kill: async () => {},
        wait: async () => ({ exitCode: 0 }),
      };
    },
  };
  return {
    id: 'test-sandbox',
    defaultWorkingDirectory: '/vercel/sandbox',
    restricted: () => session,
    ports: [4319],
    async getPortEndpoint() {
      return { url: bridgePortUrl, headers: bridgePortHeaders };
    },
    async getPortUrl() {
      return bridgePortUrl;
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

function lastStart(): Record<string, unknown> {
  const start = [...sentMessages].reverse().find(m => m.type === 'start');
  if (!start) throw new Error('no start message was sent');
  return start;
}

async function startWithFakeBridgeSocket(startupTimeoutMs = 50) {
  connectOnOpen = true;
  const harness = createClaudeCode({ startupTimeoutMs });
  return harness.doStart({
    sessionId: 's1',
    sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      writes: [],
      runs: [],
    }),
    sessionWorkDir: '/vercel/sandbox/claude-code-s1',
  });
}

describe('createClaudeCode adapter', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    openCalls.length = 0;
    connectOnOpen = false;
    wsMock.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares the harness id and builtin tools', () => {
    const harness = createClaudeCode();
    expect(harness.harnessId).toBe('claude-code');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBe(true);
    expect(Object.keys(harness.builtinTools)).toEqual([
      'read',
      'write',
      'edit',
      'bash',
      'glob',
      'grep',
      'webSearch',
      'WebFetch',
      'NotebookEdit',
      'TodoWrite',
      'Agent',
      'TaskCreate',
      'TaskGet',
      'TaskUpdate',
      'TaskList',
      'TaskStop',
      'TaskOutput',
      'Monitor',
      'ListMcpResources',
      'ListMcpResourcesTool',
      'ReadMcpResource',
      'ReadMcpResourceTool',
      'ReadMcpResourceDirTool',
      'RefreshMcpTools',
      'ExitPlanMode',
      'EnterPlanMode',
      'EnterWorktree',
      'ExitWorktree',
      'askUserQuestions',
      'Skill',
      'ToolSearch',
      'Artifact',
      'CronCreate',
      'CronDelete',
      'CronList',
      'DesignSync',
      'LSP',
      'PowerShell',
      'PushNotification',
      'RemoteTrigger',
      'ReportFindings',
      'ScheduleWakeup',
      'SendMessage',
      'SendUserFile',
      'ShareOnboardingGuide',
      'WaitForMcpServers',
      'Workflow',
    ]);
    expect(harness.builtinTools.read.nativeName).toBe('Read');
    expect(harness.builtinTools.read.commonName).toBe('read');
    expect(harness.builtinTools.read.toolUseKind).toBe('readonly');
    expect(harness.builtinTools.write.toolUseKind).toBe('edit');
    expect(harness.builtinTools.bash.toolUseKind).toBe('bash');
    expect(harness.builtinTools.Skill.toolUseKind).toBe('readonly');
    expect(harness.builtinTools.ListMcpResourcesTool.toolUseKind).toBe(
      'readonly',
    );
    expect(harness.builtinTools.PowerShell.toolUseKind).toBe('bash');
    // WebFetch has no cross-harness common equivalent — its key is the
    // native name directly, so the entry intentionally omits both
    // `nativeName` and `commonName`.
    expect(harness.builtinTools.WebFetch).toBeDefined();
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createClaudeCode();
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/vercel/sandbox',
      restricted: () =>
        ({
          run: async () => ({
            exitCode: 0,
            stdout: '/home/vercel-sandbox',
            stderr: '',
          }),
          readTextFile: async () => null,
          writeTextFile: async () => {},
        }) as never,
      ports: [] as ReadonlyArray<number>,
      async getPortEndpoint() {
        return { url: '' };
      },
      async getPortUrl() {
        return '';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('quotes dynamic startup paths in shell commands', async () => {
    const runs: string[] = [];
    const spawns: string[] = [];
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createClaudeCode();
    const session = await harness.doStart({
      sessionId: 's1; env > /tmp/leak #',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs,
        spawns,
        spawnEnvs,
        writes,
      }),
      sessionWorkDir:
        '/vercel/sandbox/claude-code-s1; env > /tmp/workdir-leak #',
    });

    expect(runs).toContain(
      "mkdir -p '/vercel/sandbox/claude-code-s1; env > /tmp/workdir-leak #' '/vercel/sandbox/.agent-runs/s1; env > /tmp/leak #/bridge'",
    );
    expect(spawns).toEqual([
      "node '/vercel/sandbox/.harness-bootstrap/claude-code/bridge.mjs' --workdir '/vercel/sandbox/claude-code-s1; env > /tmp/workdir-leak #' --bridge-state-dir '/vercel/sandbox/.agent-runs/s1; env > /tmp/leak #/bridge'",
    ]);
    await session.doDestroy();
  });

  it('prefers the per-turn model over the deprecated adapter model', async () => {
    const harness = createClaudeCode({ model: 'legacy-model' });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    const control = await session.doPromptTurn({
      model: 'agent-model',
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({ model: 'agent-model' });
    await session.doDestroy();
  });

  it('sets the client app for AI Gateway auth', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const harness = createClaudeCode({
      auth: { AI_GATEWAY_API_KEY: 'gateway-key' },
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        spawnEnvs,
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });

    expect(sentMessages.at(-1)).toMatchObject({
      type: 'start',
      env: {
        CLAUDE_AGENT_SDK_CLIENT_APP: 'ai-sdk/harness-claude-code/0.0.0-test',
      },
    });
    expect(spawnEnvs.at(0)?.BRIDGE_CHANNEL_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    await session.doDestroy();
  });

  it('sets custom headers for Gateway and direct auth', async () => {
    const gateway = createClaudeCode({
      auth: { AI_GATEWAY_API_KEY: 'gateway-key' },
    });
    const gatewaySession = await gateway.doStart({
      sessionId: 'gateway',
      headers: { 'x-tenant': 'acme' },
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-gateway',
    });
    await gatewaySession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });
    expect(sentMessages.at(-1)).toMatchObject({
      env: { ANTHROPIC_CUSTOM_HEADERS: 'x-tenant: acme' },
    });
    await gatewaySession.doDestroy();

    const direct = createClaudeCode({
      auth: { ANTHROPIC_API_KEY: 'anthropic-key' },
    });
    const directSession = await direct.doStart({
      sessionId: 'direct',
      headers: { 'x-tenant': 'acme' },
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-direct',
    });
    await directSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });
    expect(sentMessages.at(-1)).toMatchObject({
      env: { ANTHROPIC_CUSTOM_HEADERS: 'x-tenant: acme' },
    });
    await directSession.doDestroy();
  });

  it('brokers credentials when the sandbox supports additive request transformations', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const forwardedCredentials: Array<{
      credential: string;
      environmentVariableName: string;
    }> = [];
    const addRequestTransformations = vi.fn(async () => {});
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      spawnEnvs,
      writes: [],
      runs: [],
    });
    Object.assign(sandboxSession, { addRequestTransformations });
    const harness = createClaudeCode({
      auth: {
        ANTHROPIC_API_KEY: 'anthropic-secret',
        ANTHROPIC_BASE_URL: 'https://anthropic.example/v1',
      },
      credentialForwarding: async options => {
        forwardedCredentials.push(options);
        return `ephemeral-${options.environmentVariableName}`;
      },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });

    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'anthropic.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'x-api-key' },
              value: { exact: 'ephemeral-ANTHROPIC_API_KEY' },
            },
          ],
        },
        transform: { headers: { 'x-api-key': 'anthropic-secret' } },
      },
    ]);
    expect(forwardedCredentials).toEqual([
      {
        credential: expect.stringMatching(/^aisdkhc_[A-Za-z0-9_-]{43}$/),
        environmentVariableName: 'ANTHROPIC_API_KEY',
      },
    ]);
    expect(sentMessages.at(-1)).toMatchObject({
      type: 'start',
      env: { ANTHROPIC_API_KEY: 'ephemeral-ANTHROPIC_API_KEY' },
    });
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('anthropic-secret');

    await session.doDestroy();
  });

  it('customizes real credentials when request transformations are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const forwardedCredentials: Array<{
      credential: string;
      environmentVariableName: string;
    }> = [];
    const harness = createClaudeCode({
      auth: { ANTHROPIC_API_KEY: 'anthropic-secret' },
      credentialForwarding: options => {
        forwardedCredentials.push(options);
        return 'caller-managed-credential';
      },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        spawnEnvs,
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });

    expect(forwardedCredentials).toEqual([
      {
        credential: 'anthropic-secret',
        environmentVariableName: 'ANTHROPIC_API_KEY',
      },
    ]);
    expect(sentMessages.at(-1)).toMatchObject({
      type: 'start',
      env: { ANTHROPIC_API_KEY: 'caller-managed-credential' },
    });
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('anthropic-secret');
    expect(warn).not.toHaveBeenCalled();

    await session.doDestroy();

    const identityHarness = createClaudeCode({
      auth: { ANTHROPIC_API_KEY: 'anthropic-secret' },
      credentialForwarding: ({ credential }) => credential,
    });
    const identitySession = await identityHarness.doStart({
      sessionId: 's2',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        spawnEnvs: [],
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s2',
    });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );

    await identitySession.doDestroy();
  });

  it('customizes credentials forwarded through the Claude process environment', async () => {
    const forwardedCredentials: Array<{
      credential: string;
      environmentVariableName: string;
    }> = [];
    const harness = createClaudeCode({
      auth: { ANTHROPIC_API_KEY: 'bridge-secret' },
      env: {
        ANTHROPIC_API_KEY: 'turn-api-key',
        ANTHROPIC_AUTH_TOKEN: 'turn-auth-token',
        NON_SECRET: 'preserved',
      },
      credentialForwarding: options => {
        forwardedCredentials.push(options);
        return `ephemeral-${options.credential}`;
      },
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });

    expect(forwardedCredentials).toEqual([
      {
        credential: 'turn-api-key',
        environmentVariableName: 'ANTHROPIC_API_KEY',
      },
      {
        credential: 'turn-auth-token',
        environmentVariableName: 'ANTHROPIC_AUTH_TOKEN',
      },
    ]);
    expect(sentMessages.at(-1)).toMatchObject({
      type: 'start',
      env: {
        ANTHROPIC_API_KEY: 'ephemeral-turn-api-key',
        ANTHROPIC_AUTH_TOKEN: 'ephemeral-turn-auth-token',
        NON_SECRET: 'preserved',
      },
    });

    await session.doDestroy();
  });

  it('uses a caller-minted bridge token and reuses it when attaching', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const mintBridgeToken = vi.fn(
      (sandboxId: string) => `token-for-${sandboxId}`,
    );
    const harness = createClaudeCode({ mintBridgeToken });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      spawnEnvs,
      writes: [],
      runs: [],
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    expect(mintBridgeToken).toHaveBeenCalledExactlyOnceWith('test-sandbox');
    expect(spawnEnvs.at(0)?.BRIDGE_CHANNEL_TOKEN).toBe(
      'token-for-test-sandbox',
    );

    const resumeFrom = await session.doDetach();
    expect(resumeFrom.data).toMatchObject({
      bridge: { token: 'token-for-test-sandbox' },
    });

    const attachedSession = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      resumeFrom,
    });
    expect(mintBridgeToken).toHaveBeenCalledTimes(1);
    await attachedSession.doDetach();
  });

  it('resumes the exact conversation after detaching and attaching', async () => {
    const harness = createClaudeCode();
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      writes: [],
      runs: [],
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: { claudeSessionId: 'claude-session-1' },
      },
    });
    const resumeFrom = await session.doDetach();

    const attachedSession = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      resumeFrom,
    });
    const control = await attachedSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Continue the work.',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      resumeSessionId: 'claude-session-1',
    });
    expect(lastStart()).not.toHaveProperty('continue');

    await attachedSession.doDestroy();
  });

  it('passes port endpoint headers to fresh, retried, and attached WebSocket connections', async () => {
    connectOnOpen = true;
    wsMock.scripts.push(
      socket => {
        queueMicrotask(() => {
          socket.emit('error', new Error('mock connection failure'));
        });
      },
      socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
        });
      },
      socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
        });
      },
    );
    const headers = { 'E2B-Traffic-Access-Token': 'traffic-token' };
    const portEndpoint = {
      url: 'wss://sandbox.example/bridge?existing=value',
      headers,
    };
    const harness = createClaudeCode({
      mintBridgeToken: () => 'bridge-token',
      portEndpoint,
    });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://unused.example',
      writes: [],
      runs: [],
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    const resumeFrom = await session.doDetach();
    const attachedSession = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      resumeFrom,
    });

    expect(wsMock.sockets).toHaveLength(3);
    for (const socket of wsMock.sockets) {
      expect(socket.headers).toEqual(headers);
      expect(socket.url).toContain('existing=value');
      expect(socket.url).toContain('agent_bridge_token=bridge-token');
    }
    await attachedSession.doDetach();
  });

  it('does not set the client app for direct Anthropic auth', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const harness = createClaudeCode({
      auth: { ANTHROPIC_API_KEY: 'anthropic-key' },
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        spawnEnvs,
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    expect(spawnEnvs.at(0)).not.toHaveProperty('CLAUDE_AGENT_SDK_CLIENT_APP');
    await session.doDestroy();
  });

  it('sends the thinking configuration and effort to the bridge', async () => {
    const thinking = { type: 'enabled' as const, display: 'omitted' as const };
    const harness = createClaudeCode({ thinking, effort: 'max' });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'think about this',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({ thinking, effort: 'max' });

    await session.doDestroy();
  });

  it('sends configured MCP servers to the bridge', async () => {
    const mcpServers = {
      context7: { type: 'http', url: 'https://mcp.context7.com/mcp' },
    };
    const harness = createClaudeCode({ mcpServers });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Use Context7.',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({ mcpServers });

    await session.doDestroy();
  });

  it('defaults to summarized adaptive thinking', async () => {
    const harness = createClaudeCode();
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'think about this',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      thinking: { type: 'adaptive', display: 'summarized' },
    });

    await session.doDestroy();
  });

  it('sends environment configuration to the bridge', async () => {
    const env = { DEPLOYMENT_ENV: 'staging' };
    const harness = createClaudeCode({ env });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'inspect the project',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({ env });

    await session.doDestroy();
  });

  it('does not start a bridge turn when the signal is already aborted', async () => {
    const harness = createClaudeCode();
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    const abort = new AbortController();
    abort.abort(new Error('stopped before start'));

    const promptOptions = {
      skills: [],
      tools: [],
      prompt: 'never runs',
      emit: () => {},
      abortSignal: abort.signal,
    };
    const control = await session.doPromptTurn(promptOptions);

    // The turn settles as the caller's own abort…
    await expect(Promise.resolve(control.done)).rejects.toThrow(
      'stopped before start',
    );
    // …and no `start` is sent: the bridge must not run an unattended turn
    // the caller has already observed as cancelled.
    expect(sentMessages.filter(m => m.type === 'start')).toHaveLength(0);

    await session.doDestroy();
  });

  it('sends environment configuration when rerunning a continued turn', async () => {
    const env = { DEPLOYMENT_ENV: 'staging' };
    const harness = createClaudeCode({ env });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes: [],
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });
    const control = await session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({ env, continue: true });

    await session.doDestroy();
  });

  it('writes standard Claude skill files and enables their names on start', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const runs: string[] = [];
    const harness = createClaudeCode();
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes,
        runs,
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    const control = await session.doPromptTurn({
      skills: [
        {
          name: 'weather-forecast',
          description: 'Use the weather forecast tool.',
          content: 'Call `get_weather` before answering forecasts.',
          files: [
            {
              path: 'reference.md',
              content: '# Forecast reference',
            },
          ],
        },
        {
          name: 'weather-codes',
          description: 'Read weather code reference.',
          content: 'Read `weather-codes.md` for code descriptions.',
        },
      ],
      tools: [],
      prompt: 'which skills do you have available?',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      skills: ['weather-forecast', 'weather-codes'],
    });

    const skillWrites = writes.filter(write =>
      write.path.includes('/weather-'),
    );
    const bridgeMetaWrite = writes.find(write =>
      write.path.endsWith('/bridge-meta.json'),
    );
    expect(runs).toContain("mkdir -p '/home/vercel-sandbox/.claude/skills'");
    expect(bridgeMetaWrite).toEqual({
      path: '/vercel/sandbox/.agent-runs/s1/bridge/bridge-meta.json',
      content: JSON.stringify({ type: 'claude-code', state: 'starting' }),
    });
    expect(skillWrites.map(write => write.path)).toEqual(
      expect.arrayContaining([
        '/home/vercel-sandbox/.claude/skills/weather-forecast/SKILL.md',
        '/home/vercel-sandbox/.claude/skills/weather-forecast/reference.md',
        '/home/vercel-sandbox/.claude/skills/weather-codes/SKILL.md',
      ]),
    );
    expect(skillWrites).toHaveLength(3);
    expect(
      skillWrites.find(write => write.path.endsWith('/SKILL.md'))?.content,
    ).toContain('name: weather-');
    expect(
      skillWrites.find(write => write.path.endsWith('/reference.md'))?.content,
    ).toBe('# Forecast reference');
    await session.doDestroy();
  });

  it('rejects unsafe skill names before writing skill files', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createClaudeCode();

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes,
        runs: [],
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    await expect(
      session.doPromptTurn({
        skills: [
          {
            name: '../weather',
            description: 'unsafe',
            content: 'unsafe',
          },
        ],
        tools: [],
        prompt: 'Use the skill.',
        emit: () => {},
      }),
    ).rejects.toThrow('Invalid Claude Code skill name');
    expect(writes.some(write => write.path.includes('../weather'))).toBe(false);
    await session.doDestroy();
  });

  it('rejects unsafe skill file paths before writing skill files', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const runs: string[] = [];
    const harness = createClaudeCode();

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        writes,
        runs,
      }),
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });
    await expect(
      session.doPromptTurn({
        skills: [
          {
            name: 'weather',
            description: 'unsafe',
            content: 'unsafe',
            files: [{ path: '../weather-codes.md', content: 'unsafe' }],
          },
        ],
        tools: [],
        prompt: 'Use the skill.',
        emit: () => {},
      }),
    ).rejects.toThrow('Invalid Claude Code skill file path');
    expect(writes.some(write => write.path.includes('weather-codes.md'))).toBe(
      false,
    );
    expect(runs).not.toContain(
      "mkdir -p '/home/vercel-sandbox/.claude/skills'",
    );
    await session.doDestroy();
  });

  it('includes bridge startup stdout, stderr, and exit code when ready never arrives', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const harness = createClaudeCode();
    const stdout =
      JSON.stringify({
        type: 'bridge-fatal',
        message: 'Missing --workdir argument.',
      }) + '\n';
    const sandboxSession = fakeNetworkSandboxSessionForStartupFailure({
      stdout,
      stderr: 'Cannot find module @anthropic-ai/claude-agent-sdk',
      exitCode: 1,
    });

    let error: unknown;
    try {
      await harness.doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain(
      'claude-code bridge exited before becoming ready.',
    );
    expect(message).toContain('Exit code: 1.');
    expect(message).toContain('bridge-fatal');
    expect(message).toContain('Missing --workdir argument.');
    expect(message).toContain(
      'Cannot find module @anthropic-ai/claude-agent-sdk',
    );
  });

  describe('bridge WebSocket startup', () => {
    let now: number;

    beforeEach(() => {
      now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    it('does not miss bridge-hello emitted immediately after open', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
        });
      });

      const session = await startWithFakeBridgeSocket();

      expect(wsMock.sockets).toHaveLength(1);
      expect(wsMock.sockets[0].terminated).toBe(false);
      await session.doDestroy();
    });

    it('exposes steering when the bridge advertises acknowledged user messages', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit(
            'message',
            JSON.stringify({
              type: 'bridge-hello',
              capabilities: { experimental_userMessageResponses: true },
            }),
          );
        });
      });

      const session = await startWithFakeBridgeSocket();
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Weather in Paris?',
        emit: () => {},
      });

      expect(control.submitUserMessage).toBeTypeOf('function');
      await session.doDestroy();
    });

    it('submits compaction without requiring an active acknowledged turn', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
        });
      });

      const session = await startWithFakeBridgeSocket();
      await session.doCompact?.('keep the error trace');

      expect(sentMessages).toContainEqual({
        type: 'user-message',
        text: '/compact keep the error trace',
      });
      await session.doDestroy();
    });

    it('rejects when the socket opens but bridge-hello never arrives', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          now = 1_020;
        });
      });

      await expect(startWithFakeBridgeSocket(20)).rejects.toThrow(
        'claude-code bridge did not send bridge-hello',
      );
      expect(wsMock.sockets[0].terminated).toBe(true);
    });

    it('uses the remaining startup deadline for bridge-hello after open', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          now = 1_015;
          socket.emit('open');
          now = 1_020;
        });
      });

      await expect(startWithFakeBridgeSocket(20)).rejects.toThrow(
        'claude-code bridge did not send bridge-hello within 5ms',
      );
      expect(wsMock.sockets[0].terminated).toBe(true);
    });

    it('rejects when the socket closes before bridge-hello arrives', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          now = 1_020;
          socket.close();
        });
      });

      await expect(startWithFakeBridgeSocket(20)).rejects.toThrow(
        'claude-code bridge closed before sending bridge-hello',
      );
      expect(wsMock.sockets[0].terminated).toBe(true);
    });

    it('rejects when the socket does not open in time', async () => {
      wsMock.scripts.push(() => {
        queueMicrotask(() => {
          now = 1_020;
        });
      });

      await expect(startWithFakeBridgeSocket(20)).rejects.toThrow(
        'WebSocket open timed out after',
      );
      expect(wsMock.sockets[0].terminated).toBe(true);
    });

    it('preserves the startup timeout when terminating a connecting socket', async () => {
      wsMock.scripts.push(socket => {
        socket.emitErrorOnTerminate = true;
        queueMicrotask(() => {
          now = 1_020;
        });
      });

      await expect(startWithFakeBridgeSocket(20)).rejects.toThrow(
        'WebSocket open timed out after',
      );
      await new Promise(resolve => setImmediate(resolve));

      expect(wsMock.unhandledErrors).toEqual([]);
      expect(wsMock.sockets[0].terminated).toBe(true);
      expect(wsMock.sockets[0].closed).toBe(true);
    });
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createClaudeCode();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('claude-code');
      expect(recipe.bootstrapDir).toBe('.harness-bootstrap/claude-code');
    });

    it('includes bridge and package-manager assets under the bootstrap dir', async () => {
      const harness = createClaudeCode();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(f => f.path).sort();
      expect(paths).toEqual([
        '.harness-bootstrap/claude-code/bridge.mjs',
        '.harness-bootstrap/claude-code/package.json',
        '.harness-bootstrap/claude-code/pnpm-lock.yaml',
        '.harness-bootstrap/claude-code/pnpm-workspace.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('allows the pinned Claude Code build and verifies the installed CLI', async () => {
      const harness = createClaudeCode();
      const recipe = await harness.getBootstrap!();
      const commands = recipe.commands.map(c => c.command);
      const workspace = recipe.files.find(file =>
        file.path.endsWith('/pnpm-workspace.yaml'),
      );
      expect(commands).toHaveLength(2);
      expect(commands[0]).toBe(
        'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      );
      expect(commands[1]).toBe('./node_modules/.bin/claude --version');
      expect(workspace?.content).toContain(
        "'@anthropic-ai/claude-code@2.1.213': true",
      );
    });

    it('caches the recipe across calls', async () => {
      const harness = createClaudeCode();
      const a = await harness.getBootstrap!();
      const b = await harness.getBootstrap!();
      expect(a).toBe(b);
    });

    it('shares the getter across configured harness instances', () => {
      const first = createClaudeCode({ model: 'first-model' });
      const second = createClaudeCode({ model: 'second-model' });

      expect(first.getBootstrap).toBe(second.getBootstrap);
    });
  });
});
