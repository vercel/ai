import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeepAgents } from './deepagents-harness';

// Captures the wireTurn `onClose` handler so tests can fire a close with a chosen reason.
const closeHolder: { fire?: (code: number, reason: string) => void } = {};
const sentMessages: unknown[] = [];
const channelMocks = vi.hoisted(() => ({
  connectOnOpen: false,
  connects: [] as Array<() => Promise<unknown>>,
}));
const webSocketMocks = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  const calls: Array<{
    url: string;
    headers: Record<string, string> | undefined;
  }> = [];

  class FakeWebSocket {
    private readonly listeners = new Map<string, Set<Listener>>();

    constructor(url: string, options?: { headers?: Record<string, string> }) {
      calls.push({ url, headers: options?.headers });
      queueMicrotask(() => this.emit('open'));
    }

    once(type: string, listener: Listener): this {
      const onceListener: Listener = (...args) => {
        this.off(type, onceListener);
        listener(...args);
      };
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(onceListener);
      this.listeners.set(type, listeners);
      return this;
    }

    off(type: string, listener: Listener): this {
      this.listeners.get(type)?.delete(listener);
      return this;
    }

    private emit(type: string, ...args: unknown[]): void {
      for (const listener of [...(this.listeners.get(type) ?? [])]) {
        listener(...args);
      }
    }
  }

  return { calls, WebSocket: FakeWebSocket };
});

vi.mock('ws', () => ({ WebSocket: webSocketMocks.WebSocket }));

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    constructor({ connect }: { connect: () => Promise<unknown> }) {
      channelMocks.connects.push(connect);
    }
    async open(): Promise<void> {
      if (channelMocks.connectOnOpen) {
        await channelMocks.connects.at(-1)!();
      }
    }
    on(): () => void {
      return () => {};
    }
    onClose(handler: (code: number, reason: string) => void): void {
      closeHolder.fire = handler;
    }
    send(message: unknown): void {
      sentMessages.push(message);
    }
    suspend(): Promise<number> {
      return Promise.resolve(0);
    }
    beginClose(): void {}
    isClosed(): boolean {
      return false;
    }
    close(): void {}
  }
  return { ...actual, SandboxChannel: FakeSandboxChannel };
});

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFile as any)(input, ...rest);
    }),
  };
});

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function fakeSandboxSession({
  spawnEnvs,
  spawns,
  bridgePortEndpoint = { url: 'ws://127.0.0.1:4319' },
}: {
  spawnEnvs?: Array<Record<string, string | undefined>>;
  spawns?: string[];
  bridgePortEndpoint?: HarnessV1PortEndpoint;
} = {}): HarnessV1NetworkSandboxSession {
  const session = {
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
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
      return bridgePortEndpoint;
    },
    async getPortUrl() {
      return 'ws://127.0.0.1:4319';
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function startTurn() {
  closeHolder.fire = undefined;
  const harness = createDeepAgents();
  const session = await harness.doStart({
    sessionId: 'test-session',
    sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
    sandboxSession: fakeSandboxSession(),
  } as unknown as Parameters<typeof harness.doStart>[0]);
  const control = await session.doPromptTurn({
    prompt: 'hi',
    emit: () => {},
  } as unknown as Parameters<typeof session.doPromptTurn>[0]);
  return control;
}

describe('createDeepAgents', () => {
  beforeEach(() => {
    channelMocks.connectOnOpen = false;
    channelMocks.connects.length = 0;
    webSocketMocks.calls.length = 0;
  });

  it('reports the harness-v1 metadata', () => {
    const harness = createDeepAgents();
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.harnessId).toBe('deepagents');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBeUndefined();
  });

  it('ships the node bridge files and a pnpm install command in its bootstrap', async () => {
    const harness = createDeepAgents();
    const bootstrap = await harness.getBootstrap!();
    expect(bootstrap.harnessId).toBe('deepagents');
    expect(bootstrap.bootstrapDir).toBe('.harness-bootstrap/deepagents');
    const paths = bootstrap.files.map(f => f.path);
    expect(paths).toEqual([
      '.harness-bootstrap/deepagents/bridge.mjs',
      '.harness-bootstrap/deepagents/package.json',
      '.harness-bootstrap/deepagents/pnpm-lock.yaml',
    ]);
    const commands = bootstrap.commands.map(c => c.command).join('\n');
    expect(commands).toContain(
      'pnpm install --frozen-lockfile --store-dir .pnpm-store',
    );
    expect(commands).not.toContain('mkdir -p .harness-bootstrap/deepagents');
  });

  it('caches the bootstrap across calls', async () => {
    const harness = createDeepAgents();
    const a = await harness.getBootstrap!();
    const b = await harness.getBootstrap!();
    expect(a).toBe(b);
  });

  it('shares the getter across configured harness instances', () => {
    const first = createDeepAgents({ model: 'first-model' });
    const second = createDeepAgents({ model: 'second-model' });

    expect(first.getBootstrap).toBe(second.getBootstrap);
  });

  it('exposes a lifecycle state schema for resume payloads', () => {
    const harness = createDeepAgents();
    expect(harness.lifecycleStateSchema).toBeDefined();
  });

  it('passes the harness client app to the bridge environment', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const spawns: string[] = [];
    const harness = createDeepAgents();
    const session = await harness.doStart({
      sessionId: 'test-session',
      sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
      sandboxSession: fakeSandboxSession({ spawnEnvs, spawns }),
    } as unknown as Parameters<typeof harness.doStart>[0]);

    expect(spawnEnvs.at(0)?.AI_SDK_HARNESS_CLIENT_APP).toBe(
      'ai-sdk/harness-deepagents/0.0.0-test',
    );
    expect(spawnEnvs.at(0)?.BRIDGE_CHANNEL_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    expect(spawns.at(0)).toContain(
      "node '/vercel/sandbox/.harness-bootstrap/deepagents/bridge.mjs'",
    );
    expect(spawns.at(0)).toContain(
      "--bootstrap-dir '/vercel/sandbox/.harness-bootstrap/deepagents'",
    );

    await session.doDestroy();
  });

  it('brokers credentials when the sandbox supports additive request transformations', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const addRequestTransformations = vi.fn(async () => {});
    const sandboxSession = fakeSandboxSession({ spawnEnvs });
    Object.assign(sandboxSession, { addRequestTransformations });
    const harness = createDeepAgents({
      auth: {
        anthropic: {
          apiKey: 'anthropic-secret',
          baseUrl: 'https://anthropic.example',
        },
      },
    });

    const session = await harness.doStart({
      sessionId: 'test-session',
      sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
      sandboxSession,
    } as unknown as Parameters<typeof harness.doStart>[0]);

    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: { host: 'anthropic.example' },
        transform: { headers: { 'x-api-key': 'anthropic-secret' } },
      },
    ]);
    expect(spawnEnvs.at(0)?.ANTHROPIC_API_KEY).toBe('ANTHROPIC_API_KEY');
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('anthropic-secret');

    await session.doDestroy();
  });

  it('passes configured MCP servers to the bridge', async () => {
    sentMessages.length = 0;
    const mcpServers = {
      memory: { command: 'memory-mcp', args: [] },
    };
    const harness = createDeepAgents({ mcpServers });
    const session = await harness.doStart({
      sessionId: 'test-session',
      sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
      sandboxSession: fakeSandboxSession(),
    } as unknown as Parameters<typeof harness.doStart>[0]);

    await session.doPromptTurn({
      prompt: 'Use memory.',
      emit: () => {},
    });

    expect(sentMessages[0]).toMatchObject({
      type: 'start',
      mcpServers,
    });
    await session.doDestroy();
  });

  it('passes thinking configuration to the bridge', async () => {
    sentMessages.length = 0;
    const harness = createDeepAgents({
      thinking: { type: 'adaptive', display: 'summarized' },
      effort: 'max',
    });
    const session = await harness.doStart({
      sessionId: 'test-session',
      sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
      sandboxSession: fakeSandboxSession(),
    } as unknown as Parameters<typeof harness.doStart>[0]);

    await session.doPromptTurn({
      prompt: 'Think carefully.',
      emit: () => {},
    });

    expect(sentMessages[0]).toMatchInlineSnapshot(`
      {
        "effort": "max",
        "prompt": "Think carefully.",
        "skillsPaths": [
          "/vercel/sandbox/deepagents-test-session/.agents/skills",
        ],
        "thinking": {
          "display": "summarized",
          "type": "adaptive",
        },
        "tools": [],
        "type": "start",
      }
    `);
    await session.doDestroy();
  });

  it('reuses a caller-minted token and passes endpoint headers when attaching', async () => {
    channelMocks.connectOnOpen = true;
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const mintBridgeToken = vi.fn(
      (sandboxId: string) => `token-for-${sandboxId}`,
    );
    const portEndpoint = {
      url: 'wss://sandbox.example/bridge?existing=value',
      headers: { 'E2B-Traffic-Access-Token': 'traffic-token' },
    };
    const harness = createDeepAgents({ mintBridgeToken, portEndpoint });
    const sandboxSession = fakeSandboxSession({
      spawnEnvs,
      bridgePortEndpoint: { url: 'ws://unused.example' },
    });
    const session = await harness.doStart({
      sessionId: 'test-session',
      sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
      sandboxSession,
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
      sessionId: 'test-session',
      sessionWorkDir: '/vercel/sandbox/deepagents-test-session',
      sandboxSession,
      resumeFrom,
    });
    expect(mintBridgeToken).toHaveBeenCalledTimes(1);
    expect(webSocketMocks.calls).toEqual([
      {
        url: 'wss://sandbox.example/bridge?existing=value&agent_bridge_token=token-for-test-sandbox',
        headers: portEndpoint.headers,
      },
      {
        url: 'wss://sandbox.example/bridge?existing=value&agent_bridge_token=token-for-test-sandbox',
        headers: portEndpoint.headers,
      },
    ]);
    await attachedSession.doDetach();
  });

  it('resolves the turn when the channel closes with reason "suspended"', async () => {
    const control = await startTurn();
    closeHolder.fire?.(1000, 'suspended');
    await expect(control.done).resolves.toBeUndefined();
  });

  it('rejects the turn when the channel closes for any other reason', async () => {
    const control = await startTurn();
    closeHolder.fire?.(1006, 'reconnect failed');
    await expect(control.done).rejects.toThrow(
      'deepagents bridge closed before the turn finished',
    );
  });
});
