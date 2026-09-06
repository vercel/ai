import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCodex } from './codex-harness';

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
    onClose(): void {}
    send(message: unknown): void {
      sentMessages.push(message);
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
      if (text.length > 0) {
        controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}

function fakeNetworkSandboxSessionForStartupSuccess({
  bridgePortUrl,
  bridgePortHeaders,
  runs,
  spawns,
  spawnEnvs,
  writes,
  addRequestTransformations = async () => {},
}: {
  bridgePortUrl: string;
  bridgePortHeaders?: Readonly<Record<string, string>>;
  runs: string[];
  spawns: string[];
  spawnEnvs?: Array<Record<string, string | undefined>>;
  writes: Array<{ path: string; content: string }>;
  addRequestTransformations?: NonNullable<
    HarnessV1NetworkSandboxSession['addRequestTransformations']
  >;
}): HarnessV1NetworkSandboxSession {
  const session = {
    run: async ({ command }: { command: string }) => {
      runs.push(command);
      return {
        exitCode: 0,
        stdout:
          command === 'pwd'
            ? '/vercel/sandbox\n'
            : command === 'printf "%s" "$HOME"'
              ? '/home/vercel-sandbox'
              : '',
        stderr: '',
      };
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
      spawns.push(command);
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
    addRequestTransformations,
    async getPortUrl() {
      return bridgePortUrl;
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

describe('createCodex adapter', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    channelMocks.connectOnOpen = false;
    channelMocks.connects.length = 0;
    webSocketMocks.calls.length = 0;
  });

  it('declares the harness id and builtin tools', () => {
    const harness = createCodex();
    expect(harness.harnessId).toBe('codex');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(false);
    expect(Object.keys(harness.builtinTools)).toEqual(['bash', 'webSearch']);
    expect(harness.builtinTools.bash.nativeName).toBe('shell');
    expect(harness.builtinTools.bash.commonName).toBe('bash');
    expect(harness.builtinTools.webSearch.nativeName).toBe('web_search');
    expect(harness.builtinTools.webSearch.commonName).toBe('webSearch');
  });

  it('rejects built-in permission modes other than allow-all', async () => {
    const harness = createCodex();
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession: {} as HarnessV1NetworkSandboxSession,
        sessionWorkDir: '/vercel/sandbox/codex-s1',
        permissionMode: 'allow-edits',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('rejects built-in tool filtering controls', async () => {
    const harness = createCodex();
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession: {} as HarnessV1NetworkSandboxSession,
        sessionWorkDir: '/vercel/sandbox/codex-s1',
        builtinToolFiltering: { mode: 'deny', toolNames: ['bash'] },
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createCodex();
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
        sessionWorkDir: '/vercel/sandbox/codex-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('requires explicit bridge settings for a basic sandbox session', async () => {
    const networkSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:4319',
      runs: [],
      spawns: [],
      writes: [],
    });
    const sandboxSession = networkSession.restricted();

    await expect(
      createCodex({
        portEndpoint: { url: 'ws://127.0.0.1:4319' },
      }).doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/vercel/sandbox/codex-s1',
      }),
    ).rejects.toThrow(/explicit `port`/);

    await expect(
      createCodex({ port: 4319 }).doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/vercel/sandbox/codex-s1',
      }),
    ).rejects.toThrow(/explicit `portEndpoint`/);
  });

  it('uses a basic sandbox session with explicit bridge settings', async () => {
    channelMocks.connectOnOpen = true;
    const runs: string[] = [];
    const networkSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://unused.example',
      runs,
      spawns: [],
      writes: [],
    });
    const portEndpoint = {
      url: 'wss://sandbox.example/bridge',
      headers: { authorization: 'endpoint-token' },
    };
    const session = await createCodex({
      port: 4319,
      portEndpoint,
    }).doStart({
      sessionId: 's1',
      sandboxSession: networkSession.restricted(),
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });

    expect(runs).toContain('pwd');
    expect(webSocketMocks.calls.at(-1)).toEqual({
      url: expect.stringContaining('wss://sandbox.example/bridge'),
      headers: portEndpoint.headers,
    });
    const resumeFrom = await session.doDetach();
    expect(resumeFrom.data).toEqual({
      bridge: {
        port: 4319,
        token: expect.any(String),
        lastSeenEventId: 0,
      },
    });
  });

  it('requires a sandbox id for custom bridge token minting', async () => {
    const networkSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:4319',
      runs: [],
      spawns: [],
      writes: [],
    });

    await expect(
      createCodex({
        port: 4319,
        portEndpoint: { url: 'ws://127.0.0.1:4319' },
        mintBridgeToken: sandboxId => sandboxId,
      }).doStart({
        sessionId: 's1',
        sandboxSession: networkSession.restricted(),
        sessionWorkDir: '/vercel/sandbox/codex-s1',
      }),
    ).rejects.toThrow(/does not expose an id/);
  });

  it('quotes dynamic startup paths in shell commands', async () => {
    const runs: string[] = [];
    const spawns: string[] = [];
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createCodex();
    const session = await harness.doStart({
      sessionId: 's1; env > /tmp/leak #',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs,
        spawns,
        spawnEnvs,
        writes,
      }),
      sessionWorkDir: '/vercel/sandbox/codex-s1; env > /tmp/workdir-leak #',
    });

    expect(runs).toContain(
      "mkdir -p '/vercel/sandbox/codex-s1; env > /tmp/workdir-leak #' '/vercel/sandbox/.agent-runs/s1; env > /tmp/leak #/bridge'",
    );
    expect(spawns).toEqual([
      "node '/vercel/sandbox/.harness-bootstrap/codex/bridge.mjs' --workdir '/vercel/sandbox/codex-s1; env > /tmp/workdir-leak #' --bridge-state-dir '/vercel/sandbox/.agent-runs/s1; env > /tmp/leak #/bridge' --cli-shim-dir '/vercel/sandbox/.agent-runs/s1; env > /tmp/leak #/codex'",
    ]);
    expect(spawnEnvs.at(0)?.AI_SDK_HARNESS_CLIENT_APP).toBe(
      'ai-sdk/harness-codex/0.0.0-test',
    );
    expect(spawnEnvs.at(0)?.BRIDGE_CHANNEL_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    await session.doDestroy();
  });

  it('prefers the per-turn model over the deprecated adapter model', async () => {
    const harness = createCodex({ model: 'legacy-model' });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs: [],
        spawns: [],
        writes: [],
      }),
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });
    const control = await session.doPromptTurn({
      model: 'agent-model',
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    await vi.waitFor(() => {
      expect(sentMessages.at(-1)).toMatchObject({
        type: 'start',
        model: 'agent-model',
      });
    });
    await session.doDestroy();
  });

  it('passes headers to the bridge for Gateway and direct auth', async () => {
    const gatewaySession = await createCodex({
      auth: { AI_GATEWAY_API_KEY: 'gateway-key' },
    }).doStart({
      sessionId: 'gateway',
      headers: { 'x-tenant': 'acme' },
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs: [],
        spawns: [],
        writes: [],
      }),
      sessionWorkDir: '/vercel/sandbox/codex-gateway',
    });
    const gatewayControl = await gatewaySession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });
    void Promise.resolve(gatewayControl.done).catch(() => {});

    await vi.waitFor(() => {
      expect(sentMessages.at(-1)).toMatchObject({
        type: 'start',
        headers: { 'x-tenant': 'acme' },
      });
    });
    await gatewaySession.doDestroy();

    const directSession = await createCodex({
      auth: { OPENAI_API_KEY: 'openai-key' },
    }).doStart({
      sessionId: 'direct',
      headers: { 'x-tenant': 'acme' },
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs: [],
        spawns: [],
        writes: [],
      }),
      sessionWorkDir: '/vercel/sandbox/codex-direct',
    });
    const directControl = await directSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });
    void Promise.resolve(directControl.done).catch(() => {});

    await vi.waitFor(() => {
      expect(sentMessages.at(-1)).toMatchObject({
        type: 'start',
        headers: { 'x-tenant': 'acme' },
      });
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
      runs: [],
      spawns: [],
      spawnEnvs,
      writes: [],
      addRequestTransformations,
    });
    const harness = createCodex({
      auth: {
        OPENAI_API_KEY: 'openai-secret',
        OPENAI_BASE_URL: 'https://openai.example/v1',
      },
      credentialForwarding: async options => {
        forwardedCredentials.push(options);
        return `ephemeral-${options.environmentVariableName}`;
      },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });

    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'openai.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer ephemeral-CODEX_API_KEY' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer openai-secret' },
        },
      },
    ]);
    expect(forwardedCredentials).toEqual([
      {
        credential: expect.stringMatching(/^aisdkhc_[A-Za-z0-9_-]{43}$/),
        environmentVariableName: 'CODEX_API_KEY',
      },
    ]);
    expect(spawnEnvs.at(0)?.CODEX_API_KEY).toBe('ephemeral-CODEX_API_KEY');
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('openai-secret');

    await session.doDestroy();
  });

  it('customizes real credentials when request transformations are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const forwardedCredentials: Array<{
      credential: string;
      environmentVariableName: string;
    }> = [];
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      runs: [],
      spawns: [],
      spawnEnvs,
      writes: [],
    });
    Object.assign(sandboxSession, { addRequestTransformations: undefined });
    const harness = createCodex({
      auth: { OPENAI_API_KEY: 'openai-secret' },
      credentialForwarding: options => {
        forwardedCredentials.push(options);
        return 'caller-managed-credential';
      },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });

    expect(forwardedCredentials).toEqual([
      {
        credential: 'openai-secret',
        environmentVariableName: 'CODEX_API_KEY',
      },
    ]);
    expect(spawnEnvs.at(0)?.CODEX_API_KEY).toBe('caller-managed-credential');
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('openai-secret');
    expect(warn).not.toHaveBeenCalled();

    await session.doDestroy();

    const identityHarness = createCodex({
      auth: { OPENAI_API_KEY: 'openai-secret' },
      credentialForwarding: ({ credential }) => credential,
    });
    const identitySandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      runs: [],
      spawns: [],
      spawnEnvs: [],
      writes: [],
    });
    Object.assign(identitySandboxSession, {
      addRequestTransformations: undefined,
    });
    const identitySession = await identityHarness.doStart({
      sessionId: 's2',
      sandboxSession: identitySandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s2',
    });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );

    await identitySession.doDestroy();
    warn.mockRestore();
  });

  it('configures the standard OpenAI URL for brokered direct auth', async () => {
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const addRequestTransformations = vi.fn(async () => {});
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      runs: [],
      spawns: [],
      spawnEnvs,
      writes: [],
      addRequestTransformations,
    });
    const harness = createCodex({
      auth: { OPENAI_API_KEY: 'openai-secret' },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });

    const sandboxCredential = spawnEnvs.at(0)?.CODEX_API_KEY;
    expect(sandboxCredential).toMatch(/^aisdkhc_[A-Za-z0-9_-]{43}$/);

    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'api.openai.com',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: `Bearer ${sandboxCredential}` },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer openai-secret' },
        },
      },
    ]);
    expect(spawnEnvs.at(0)?.CODEX_API_KEY).toBe(sandboxCredential);
    expect(spawnEnvs.at(0)?.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');

    await session.doDestroy();
  });

  it('sends configured MCP servers to the bridge', async () => {
    const mcpServers = {
      context7: { url: 'https://mcp.context7.com/mcp' },
    };
    const session = await createCodex({ mcpServers }).doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs: [],
        spawns: [],
        writes: [],
      }),
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Use Context7.',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    await vi.waitFor(() => {
      expect(sentMessages.at(-1)).toMatchObject({
        type: 'start',
        mcpServers,
      });
    });

    await session.doDestroy();
  });

  it('sends configured Codex config to the bridge', async () => {
    const codexConfig = {
      model_verbosity: 'low',
      features: { multi_agent: false },
    };
    const session = await createCodex({ codexConfig }).doStart({
      sessionId: 's1',
      sandboxSession: fakeNetworkSandboxSessionForStartupSuccess({
        bridgePortUrl: 'ws://127.0.0.1:1',
        runs: [],
        spawns: [],
        writes: [],
      }),
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Be concise.',
      emit: () => {},
    });
    void Promise.resolve(control.done).catch(() => {});

    await vi.waitFor(() => {
      expect(sentMessages.at(-1)).toMatchObject({
        type: 'start',
        codexConfig,
      });
    });

    await session.doDestroy();
  });

  it('uses a caller-minted bridge token and reuses it when attaching', async () => {
    const runs: string[] = [];
    const spawns: string[] = [];
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const mintBridgeToken = vi.fn(
      (sandboxId: string) => `token-for-${sandboxId}`,
    );
    const harness = createCodex({ mintBridgeToken });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      runs,
      spawns,
      spawnEnvs,
      writes: [],
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
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
      sessionWorkDir: '/vercel/sandbox/codex-s1',
      resumeFrom,
    });
    expect(mintBridgeToken).toHaveBeenCalledTimes(1);
    await attachedSession.doDetach();
  });

  it('passes port endpoint headers to fresh and attached WebSocket connections', async () => {
    channelMocks.connectOnOpen = true;
    const headers = { 'E2B-Traffic-Access-Token': 'traffic-token' };
    const harness = createCodex({ mintBridgeToken: () => 'bridge-token' });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'wss://sandbox.example/bridge?existing=value',
      bridgePortHeaders: headers,
      runs: [],
      spawns: [],
      writes: [],
    });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });

    const resumeFrom = await session.doDetach();
    const attachedSession = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
      resumeFrom,
    });

    expect(webSocketMocks.calls).toHaveLength(2);
    for (const call of webSocketMocks.calls) {
      expect(call.headers).toEqual(headers);
      expect(call.url).toContain('existing=value');
      expect(call.url).toContain('agent_bridge_token=bridge-token');
    }
    await attachedSession.doDetach();
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createCodex();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('codex');
      expect(recipe.bootstrapDir).toBe('.harness-bootstrap/codex');
    });

    it('includes bridge.mjs, package.json, and pnpm-lock.yaml under the bootstrap dir', async () => {
      const harness = createCodex();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(f => f.path).sort();
      expect(paths).toEqual([
        '.harness-bootstrap/codex/bridge.mjs',
        '.harness-bootstrap/codex/package.json',
        '.harness-bootstrap/codex/pnpm-lock.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('declares a pnpm install command for the bootstrap cwd', async () => {
      const harness = createCodex();
      const recipe = await harness.getBootstrap!();
      const commands = recipe.commands.map(c => c.command);
      expect(commands).toEqual([
        'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      ]);
    });

    it('caches the recipe across calls', async () => {
      const harness = createCodex();
      const a = await harness.getBootstrap!();
      const b = await harness.getBootstrap!();
      expect(a).toBe(b);
    });

    it('shares the getter across configured harness instances', () => {
      const first = createCodex({ model: 'first-model' });
      const second = createCodex({
        model: 'second-model',
        webSearch: true,
      });

      expect(first.getBootstrap).toBe(second.getBootstrap);
    });
  });
});
