import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod/v4';

const sentMessages: Array<Record<string, unknown>> = [];
const openCalls: Array<{ resume?: boolean } | undefined> = [];
const reconnects: Array<unknown> = [];
const debugHooks: Array<unknown> = [];
const subscribedEventTypes: string[] = [];
const channelListeners = new Map<
  string,
  Set<(event: Record<string, unknown>) => void>
>();
let connectOnOpen = false;

function dispatchChannelEvent(event: Record<string, unknown>): void {
  for (const listener of channelListeners.get(String(event.type)) ?? []) {
    listener(event);
  }
}

const wsMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const sockets: FakeWebSocket[] = [];
  const scripts: Array<(socket: FakeWebSocket) => void> = [];

  class FakeWebSocket {
    readonly url: string;
    readonly headers: Record<string, string> | undefined;
    readonly handlers = new Map<string, Set<Handler>>();
    terminated = false;

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
      if (event === 'error' && handlers.size === 0) throw args[0];
      for (const handler of handlers) {
        handler(...args);
      }
    }

    terminate(): void {
      this.terminated = true;
    }
  }

  return {
    FakeWebSocket,
    sockets,
    scripts,
    reset: () => {
      sockets.length = 0;
      scripts.length = 0;
    },
  };
});

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    private readonly connect: (options: {
      abortSignal: AbortSignal;
      reason: 'open' | 'reconnect';
    }) => Promise<unknown>;

    constructor({
      connect,
      reconnect,
      onDebug,
    }: {
      connect: (options: {
        abortSignal: AbortSignal;
        reason: 'open' | 'reconnect';
      }) => Promise<unknown>;
      reconnect?: unknown;
      onDebug?: unknown;
    }) {
      this.connect = connect;
      reconnects.push(reconnect);
      debugHooks.push(onDebug);
    }

    async open(opts?: { resume?: boolean }): Promise<void> {
      openCalls.push(opts);
      if (connectOnOpen) {
        await this.connect({
          abortSignal: new AbortController().signal,
          reason: 'open',
        });
      }
    }
    beginListenerAttachment(): () => void {
      return () => {};
    }
    on(
      type: string,
      listener: (event: Record<string, unknown>) => void,
    ): () => void {
      subscribedEventTypes.push(type);
      const listeners =
        channelListeners.get(type) ??
        new Set<(event: Record<string, unknown>) => void>();
      listeners.add(listener);
      channelListeners.set(type, listeners);
      return () => {
        listeners.delete(listener);
      };
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
      if (path.endsWith('/bridge/pnpm-lockfile.yaml'))
        return 'lockfileVersion: "9.0"\n';
      if (path.endsWith('/bridge/pnpm-workspace.yaml'))
        return "allowBuilds:\n  '@anthropic-ai/claude-code': true\n";
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

async function startWithFakeBridgeSocket() {
  connectOnOpen = true;
  const harness = createClaudeCode();
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
    reconnects.length = 0;
    debugHooks.length = 0;
    subscribedEventTypes.length = 0;
    channelListeners.clear();
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
      'ListAgents',
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
    expect(harness.builtinTools.ListAgents.toolUseKind).toBe('readonly');
    expect(harness.builtinTools.ListMcpResourcesTool.toolUseKind).toBe(
      'readonly',
    );
    expect(harness.builtinTools.PowerShell.toolUseKind).toBe('bash');
    // WebFetch has no cross-harness common equivalent — its key is the
    // native name directly, so the entry intentionally omits both
    // `nativeName` and `commonName`.
    expect(harness.builtinTools.WebFetch).toBeDefined();

    const listAgentsInputSchema = harness.builtinTools.ListAgents
      .inputSchema as z.ZodType;
    expect(listAgentsInputSchema.parse({})).toEqual({});
    expect(
      listAgentsInputSchema.parse({ channel: 'reviewers', q: 'available' }),
    ).toEqual({ channel: 'reviewers', q: 'available' });
    expect(() =>
      listAgentsInputSchema.parse({ channel: 'a'.repeat(257) }),
    ).toThrow();
    expect(() => listAgentsInputSchema.parse({ unsupported: true })).toThrow();
  });

  it('allows callers to disable native agent discovery', () => {
    expect(
      () =>
        new HarnessAgent({
          harness: createClaudeCode(),
          inactiveTools: ['ListAgents'],
        }),
    ).not.toThrow();
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createClaudeCode({
      auth: { ANTHROPIC_API_KEY: 'test-api-key' },
    });
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
    ).rejects.toSatisfy(HarnessCapabilityUnsupportedError.isInstance);
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

    const sessionStateDir =
      '/home/vercel-sandbox/.ai-sdk-harness/.agent-runs/s1%3B%20env%20%3E%20%2Ftmp%2Fleak%20%23';
    expect(runs).toContain(
      `mkdir -p '/vercel/sandbox/claude-code-s1; env > /tmp/workdir-leak #' '${sessionStateDir}/bridge'`,
    );
    expect(spawns).toEqual([
      `node '/home/vercel-sandbox/.ai-sdk-harness/.harness-bootstrap/claude-code/bridge.mjs' --workdir '/vercel/sandbox/claude-code-s1; env > /tmp/workdir-leak #' --bridge-state-dir '${sessionStateDir}/bridge'`,
    ]);
    await session.doDestroy();
  });

  it('sends the per-turn model to the CLI', async () => {
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

  it('sends configured subagent activity options to the bridge', async () => {
    const harness = createClaudeCode({
      agentProgressSummaries: true,
      forwardSubagentText: true,
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

    expect(lastStart()).toMatchObject({
      agentProgressSummaries: true,
      forwardSubagentText: true,
    });
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
        CLAUDE_AGENT_SDK_CLIENT_APP: 'ai-sdk-harness-claude-code/0.0.0-test',
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

  it('adds a Gateway placeholder when resuming with a new authentication mode', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const addRequestTransformations = vi.fn(
      async (
        _transformations: Parameters<
          NonNullable<
            HarnessV1NetworkSandboxSession['addRequestTransformations']
          >
        >[0],
      ) => {},
    );
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      spawnEnvs,
      writes: [],
      runs: [],
    });
    Object.assign(sandboxSession, { addRequestTransformations });
    const session = await createClaudeCode({
      auth: { AI_GATEWAY_API_KEY: 'current-gateway-secret' },
    }).doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {
          sandboxCredentialEnvironment: {
            ANTHROPIC_API_KEY: 'saved-anthropic-placeholder',
          },
        },
      },
    });

    await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Continue the session.',
      emit: () => {},
    });
    const sandboxEnv = lastStart().env as Record<string, string>;
    expect(sandboxEnv.ANTHROPIC_API_KEY).toBe('saved-anthropic-placeholder');
    expect(sandboxEnv.AI_GATEWAY_API_KEY).toMatch(
      /^aisdkhc_[A-Za-z0-9_-]{43}$/,
    );
    expect(JSON.stringify(sandboxEnv)).not.toContain('current-gateway-secret');
    expect(JSON.stringify(spawnEnvs[0])).not.toContain(
      'current-gateway-secret',
    );
    expect(addRequestTransformations.mock.calls[0]?.[0]).toContainEqual({
      match: {
        host: 'ai-gateway.vercel.sh',
        headers: [
          {
            key: { exact: 'x-api-key' },
            value: { exact: 'saved-anthropic-placeholder' },
          },
        ],
      },
      transform: { headers: { 'x-api-key': 'current-gateway-secret' } },
    });
    await session.doDestroy();
  });

  it('brokers an explicit Claude OAuth token at the host boundary', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const addRequestTransformations = vi.fn(async () => {});
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      spawnEnvs,
      writes: [],
      runs: [],
    });
    Object.assign(sandboxSession, { addRequestTransformations });
    const harness = createClaudeCode({
      auth: { CLAUDE_CODE_OAUTH_TOKEN: 'host-oauth-token' },
      credentialForwarding: ({ environmentVariableName }) =>
        `ephemeral-${environmentVariableName}`,
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
          host: 'api.anthropic.com',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: {
                exact: 'Bearer ephemeral-CLAUDE_CODE_OAUTH_TOKEN',
              },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer host-oauth-token' },
        },
      },
    ]);
    expect(sentMessages.at(-1)).toMatchObject({
      type: 'start',
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: 'ephemeral-CLAUDE_CODE_OAUTH_TOKEN',
      },
    });
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('host-oauth-token');

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
    const reconnect = {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    };
    const harness = createClaudeCode({ mintBridgeToken, reconnect });
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
    expect(reconnects).toEqual([reconnect, reconnect]);
    await attachedSession.doDetach();
  });

  it('forwards channel debug events for fresh and attached sessions', async () => {
    const onDebug = vi.fn();
    const harness = createClaudeCode({ onDebug });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
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

    expect(debugHooks).toEqual([onDebug, onDebug]);
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

  it('makes a single attempt when attaching and falls back to respawning', async () => {
    connectOnOpen = true;
    const openWithHello = (socket: {
      emit: (event: string, ...args: unknown[]) => void;
    }) => {
      queueMicrotask(() => {
        socket.emit('open');
        socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
      });
    };
    wsMock.scripts.push(
      openWithHello,
      socket => {
        queueMicrotask(() => {
          socket.emit('error', new Error('mock attach failure'));
        });
      },
      openWithHello,
    );
    const harness = createClaudeCode({ mintBridgeToken: () => 'bridge-token' });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      writes: [],
      runs: [],
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
    });

    const resumeFrom = await session.doDetach();
    const resumedSession = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      resumeFrom,
    });

    expect(wsMock.sockets).toHaveLength(3);
    expect(wsMock.sockets[1].terminated).toBe(true);
    expect(wsMock.sockets[2].terminated).toBe(false);
    await resumedSession.doDetach();
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

  it('sends strict MCP config and the budget limit to the bridge', async () => {
    const harness = createClaudeCode({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
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
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'hello',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
    });

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

  it('sends skill overrides and host tool hints to the bridge', async () => {
    const skillOverrides = {
      'update-config': 'off',
      'fewer-permission-prompts': 'off',
      init: 'off',
    } as const;
    const toolHints = { search: { readOnly: true, alwaysLoad: true } };
    const harness = createClaudeCode({ skillOverrides, toolHints });
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
      prompt: 'Search the docs.',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({ skillOverrides, toolHints });

    await session.doDestroy();
  });

  it('omits skill overrides when they are not configured', async () => {
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
      prompt: 'inspect the project',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).not.toHaveProperty('skillOverrides');

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

  it('sends environment configuration and tool hints when rerunning a continued turn', async () => {
    const env = { DEPLOYMENT_ENV: 'staging' };
    const toolHints = { search: { readOnly: true } };
    const harness = createClaudeCode({ env, toolHints });
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

    expect(lastStart()).toMatchObject({ env, toolHints, continue: true });

    await session.doDestroy();
  });

  it('sends skill overrides when rerunning a continued turn', async () => {
    const skillOverrides = { init: 'off' } as const;
    const harness = createClaudeCode({ skillOverrides });
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

    expect(lastStart()).toMatchObject({ skillOverrides, continue: true });

    await session.doDestroy();
  });

  it('sends strict MCP config and the budget limit when rerunning a continued turn', async () => {
    const harness = createClaudeCode({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
    });
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

    expect(lastStart()).toMatchObject({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
      continue: true,
    });

    await session.doDestroy();
  });

  it('sends strict MCP config and the budget limit after attaching', async () => {
    const harness = createClaudeCode({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
    });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
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
    const control = await attachedSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'hello again',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
    });

    await attachedSession.doDestroy();
  });

  it('sends the question timeout and excludeDynamicSections to the bridge', async () => {
    const harness = createClaudeCode({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
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
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'hello',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
    });

    await session.doDestroy();
  });

  it('sends the question timeout and excludeDynamicSections when rerunning a continued turn', async () => {
    const harness = createClaudeCode({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
    });
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

    expect(lastStart()).toMatchObject({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
      continue: true,
    });

    await session.doDestroy();
  });

  it.each(['continueFrom', 'resumeFrom'] as const)(
    'resumes a deferred approval when rerunning a continued turn (%s)',
    async lifecycle => {
      const continueFrom = {
        type: 'continue-turn' as const,
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1' as const,
        data: {},
        pendingToolApprovals: [
          {
            approvalId: 'call-1',
            toolCallId: 'call-1',
            toolName: 'bash',
            input: '{"command":"pwd"}',
            kind: 'builtin' as const,
            providerExecuted: true,
            nativeName: 'Bash',
          },
        ],
      };
      const harness = createClaudeCode();
      const session = await harness.doStart({
        sessionId: 's1',
        sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
          bridgePortUrl: 'ws://127.0.0.1:1',
          writes: [],
          runs: [],
        }),
        sessionWorkDir: '/vercel/sandbox/claude-code-s1',
        permissionMode: 'allow-reads',
        ...(lifecycle === 'continueFrom'
          ? { continueFrom }
          : {
              resumeFrom: {
                type: 'resume-session' as const,
                harnessId: 'claude-code',
                specificationVersion: 'harness-v1' as const,
                data: {},
                continueFrom,
              },
            }),
      });
      const control = await session.doContinueTurn({
        skills: [],
        tools: [],
        emit: () => {},
      });
      void Promise.resolve(control.done).catch(() => {});

      expect(lastStart()).toMatchObject({ deferredToolUseId: 'call-1' });

      await session.doDestroy();
    },
  );

  it('sends the question timeout and excludeDynamicSections after attaching', async () => {
    const harness = createClaudeCode({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
    });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
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
    const control = await attachedSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'hello again',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    expect(lastStart()).toMatchObject({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
    });

    await attachedSession.doDestroy();
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
      path: '/home/vercel-sandbox/.ai-sdk-harness/.agent-runs/s1/bridge/bridge-meta.json',
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

  describe('user message content', () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    async function promptTurn(prompt: HarnessV1Prompt) {
      const session = await createClaudeCode().doStart({
        sessionId: 's1',
        sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
          bridgePortUrl: 'ws://127.0.0.1:1',
          writes: [],
          runs: [],
        }),
        sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      });
      try {
        const control = await session.doPromptTurn({
          skills: [],
          tools: [],
          prompt,
          emit: () => {},
        });
        void Promise.resolve(control.done).catch(() => {});
      } finally {
        await session.doDestroy();
      }
    }

    it('sends a text-only user message as a string prompt', async () => {
      await promptTurn({
        role: 'user',
        content: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' },
        ],
      });

      expect(lastStart().prompt).toBe('First\n\nSecond');
    });

    it('sends inline images as image blocks', async () => {
      await promptTurn({
        role: 'user',
        content: [
          { type: 'text', text: 'What is in these images?' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'url', url: new URL(`data:image/png;base64,${png}`) },
          },
          {
            type: 'file',
            mediaType: 'image',
            data: { type: 'data', data: convertBase64ToUint8Array(png) },
          },
          { type: 'file', mediaType: 'image/png', data: png },
          { type: 'image', image: png },
        ],
      });

      expect(lastStart().prompt).toEqual([
        { type: 'text', text: 'What is in these images?' },
        { type: 'image', mediaType: 'image/png', data: png },
        { type: 'image', mediaType: 'image/png', data: png },
        { type: 'image', mediaType: 'image/png', data: png },
        { type: 'image', mediaType: 'image/png', data: png },
      ]);
    });

    it.each([
      {
        name: 'remote image URLs',
        part: {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'url', url: new URL('https://example.com/a.png') },
        },
      },
      {
        name: 'provider references',
        part: {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'reference', reference: { anthropic: 'file_1' } },
        },
      },
      {
        name: 'non-image files',
        part: {
          type: 'file',
          mediaType: 'application/pdf',
          data: { type: 'data', data: png },
        },
      },
      {
        name: 'data URLs that are not base64 encoded',
        part: {
          type: 'file',
          mediaType: 'image/svg+xml',
          data: new URL('data:image/svg+xml,%3Csvg%3E%3C/svg%3E'),
        },
      },
      {
        name: 'images whose media type cannot be detected',
        part: {
          type: 'file',
          mediaType: 'image',
          data: { type: 'data', data: 'aGVsbG8=' },
        },
      },
    ] as const)('rejects $name', async ({ part }) => {
      await expect(
        promptTurn({ role: 'user', content: [part] }),
      ).rejects.toSatisfy(HarnessCapabilityUnsupportedError.isInstance);
      expect(sentMessages.filter(m => m.type === 'start')).toHaveLength(0);
    });
  });

  describe('bridge WebSocket startup', () => {
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

    it('forwards compaction events without blocking turn completion', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
        });
      });

      const session = await startWithFakeBridgeSocket();
      const events: Array<Record<string, unknown>> = [];
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Continue',
        emit: event => events.push(event),
      });

      expect(subscribedEventTypes).toContain('compaction');
      dispatchChannelEvent({
        type: 'compaction',
        trigger: 'auto',
        summary: 'Compacted context',
      });
      dispatchChannelEvent({ type: 'finish' });

      await expect(control.done).resolves.toBeUndefined();
      expect(events).toEqual([
        {
          type: 'compaction',
          trigger: 'auto',
          summary: 'Compacted context',
        },
        { type: 'finish' },
      ]);
      await session.doDestroy();
    });

    it('forwards raw response boundaries without ending the turn', async () => {
      wsMock.scripts.push(socket => {
        queueMicrotask(() => {
          socket.emit('open');
          socket.emit('message', JSON.stringify({ type: 'bridge-hello' }));
        });
      });

      const session = await startWithFakeBridgeSocket();
      const events: Array<Record<string, unknown>> = [];
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Continue',
        emit: event => events.push(event),
      });
      const boundary = {
        type: 'raw' as const,
        rawValue: {
          type: 'stream_event',
          event: { type: 'message_stop' },
          usage: {
            input_tokens: 10,
            output_tokens: 2,
          },
        },
      };

      expect(subscribedEventTypes).toContain('raw');
      dispatchChannelEvent(boundary);
      expect(events).toEqual([boundary]);

      dispatchChannelEvent({ type: 'finish' });
      await expect(control.done).resolves.toBeUndefined();
      await session.doDestroy();
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
      expect(workspace?.content).toContain("'@anthropic-ai/claude-code': true");
    });

    it('caches the recipe across calls', async () => {
      const harness = createClaudeCode();
      const a = await harness.getBootstrap!();
      const b = await harness.getBootstrap!();
      expect(a).toBe(b);
    });

    it('shares the getter across configured harness instances', () => {
      const first = createClaudeCode({ maxTurns: 1 });
      const second = createClaudeCode({ maxTurns: 2 });

      expect(first.getBootstrap).toBe(second.getBootstrap);
    });
  });
});
