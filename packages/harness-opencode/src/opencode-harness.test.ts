import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenCode } from './opencode-harness';

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
      queueMicrotask(() => {
        this.emit('open');
        this.emit(
          'message',
          JSON.stringify({
            type: 'bridge-hello',
            ...(webSocketMocks.supportsUserMessageResponses
              ? {
                  capabilities: {
                    experimental_userMessageResponses: true,
                  },
                }
              : {}),
          }),
        );
      });
    }

    on(type: string, listener: Listener): this {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
      return this;
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

  return {
    calls,
    supportsUserMessageResponses: true,
    WebSocket: FakeWebSocket,
  };
});

vi.mock('ws', () => ({ WebSocket: webSocketMocks.WebSocket }));

const harnessUtilsMocks = vi.hoisted(() => {
  type ChannelEvent = { type: string; [key: string]: unknown };
  const channels: Array<{
    sent: unknown[];
    closed: boolean;
    connect: () => Promise<unknown>;
    emit(type: string, event: ChannelEvent): void;
  }> = [];

  class MockSandboxChannel {
    sent: unknown[] = [];
    closed = false;
    private readonly listeners = new Map<
      string,
      Set<(event: ChannelEvent) => void>
    >();

    constructor({ connect }: { connect: () => Promise<unknown> }) {
      this.connect = connect;
      channels.push(this);
    }

    readonly connect: () => Promise<unknown>;

    async open() {
      if (harnessUtilsMocks.connectOnOpen) await this.connect();
    }

    send(message: unknown) {
      this.sent.push(message);
    }

    on(type: string, listener: (event: ChannelEvent) => void) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
      return () => listeners.delete(listener);
    }

    onReconnect() {
      return () => {};
    }

    emit(type: string, event: ChannelEvent) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    onClose() {}

    beginClose() {}

    isClosed() {
      return this.closed;
    }

    async suspend() {
      return 0;
    }

    close() {
      this.closed = true;
    }
  }

  return {
    channels,
    connectOnOpen: false,
    markBridgeStarting: vi.fn(),
    SandboxChannel: MockSandboxChannel,
    waitForBridgeReady: vi.fn(async (): Promise<{ port: number }> => {
      throw new Error('stop after spawn');
    }),
  };
});

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  return {
    ...actual,
    markBridgeStarting: harnessUtilsMocks.markBridgeStarting,
    SandboxChannel: harnessUtilsMocks.SandboxChannel,
    waitForBridgeReady: harnessUtilsMocks.waitForBridgeReady,
  };
});

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
      const [input] = args;
      const filePath = typeof input === 'string' ? input : String(input);
      if (filePath.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (filePath.endsWith('/bridge/host-tool-mcp.mjs'))
        return '// mock host-tool-mcp\n';
      if (filePath.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      return actual.readFile(...args);
    }),
  };
});

function getBuiltinToolMetadata(tool: unknown): {
  nativeName?: string;
  commonName?: string;
} {
  return tool as { nativeName?: string; commonName?: string };
}

describe('createOpenCode adapter', () => {
  beforeEach(() => {
    harnessUtilsMocks.connectOnOpen = false;
    webSocketMocks.supportsUserMessageResponses = true;
    webSocketMocks.calls.length = 0;
  });

  it('declares the harness id and builtin tools', () => {
    const harness = createOpenCode();
    expect(harness.harnessId).toBe('opencode');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBeUndefined();
    expect(Object.keys(harness.builtinTools)).toEqual([
      'askUserQuestions',
      'read',
      'write',
      'edit',
      'bash',
      'glob',
      'grep',
      'ls',
      'webfetch',
      'skill',
      'todowrite',
      'agent',
    ]);
    expect(getBuiltinToolMetadata(harness.builtinTools.read).nativeName).toBe(
      'view',
    );
    expect(getBuiltinToolMetadata(harness.builtinTools.read).commonName).toBe(
      'read',
    );
    expect(
      getBuiltinToolMetadata(harness.builtinTools.agent).nativeName,
    ).toBeUndefined();
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createOpenCode();
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
        sessionWorkDir: '/vercel/sandbox/opencode-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('reuses a caller-minted token and passes endpoint headers when attaching', async () => {
    harnessUtilsMocks.connectOnOpen = true;
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const mintBridgeToken = vi.fn(
      (sandboxId: string) => `token-for-${sandboxId}`,
    );
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const sandbox = {
      async run({ command }: { command: string }) {
        return command === 'printf "%s" "$HOME"'
          ? { exitCode: 0, stdout: '/home/vercel-sandbox', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' };
      },
      async readTextFile() {
        return null;
      },
      async spawn({ env }: { env: Record<string, string | undefined> }) {
        spawnEnvs.push(env);
        return {
          stdout: emptyStream(),
          stderr: emptyStream(),
          async wait() {},
          async kill() {},
        };
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      async getPortEndpoint() {
        return { url: 'ws://unused.example' };
      },
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    const portEndpoint = {
      url: 'wss://sandbox.example/bridge?existing=value',
      headers: { 'E2B-Traffic-Access-Token': 'traffic-token' },
    };
    const harness = createOpenCode({ mintBridgeToken, portEndpoint });
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/workspace/project',
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
      sessionWorkDir: '/workspace/project',
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

  it('brokers credentials when the sandbox supports additive request transformations', async () => {
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const forwardedCredentials: Array<{
      credential: string;
      environmentVariableName: string;
    }> = [];
    const addRequestTransformations = vi.fn(async () => {});
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const sandbox = {
      async run({ command }: { command: string }) {
        return command === 'printf "%s" "$HOME"'
          ? { exitCode: 0, stdout: '/home/vercel-sandbox', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' };
      },
      async readTextFile() {
        return null;
      },
      async spawn({ env }: { env: Record<string, string | undefined> }) {
        spawnEnvs.push(env);
        return {
          stdout: emptyStream(),
          stderr: emptyStream(),
          async wait() {},
          async kill() {},
        };
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      addRequestTransformations,
      async getPortEndpoint() {
        return { url: 'ws://sandbox.example' };
      },
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    const harness = createOpenCode({
      provider: 'openai',
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
      sessionWorkDir: '/workspace/project',
    });

    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'openai.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer ephemeral-OPENAI_API_KEY' },
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
        environmentVariableName: 'OPENAI_API_KEY',
      },
    ]);
    expect(spawnEnvs.at(0)?.OPENAI_API_KEY).toBe('ephemeral-OPENAI_API_KEY');
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('openai-secret');

    await session.doDetach();
  });

  it('customizes real credentials when request transformations are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const forwardedCredentials: Array<{
      credential: string;
      environmentVariableName: string;
    }> = [];
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const sandbox = {
      async run({ command }: { command: string }) {
        return command === 'printf "%s" "$HOME"'
          ? { exitCode: 0, stdout: '/home/vercel-sandbox', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' };
      },
      async readTextFile() {
        return null;
      },
      async spawn({ env }: { env: Record<string, string | undefined> }) {
        spawnEnvs.push(env);
        return {
          stdout: emptyStream(),
          stderr: emptyStream(),
          async wait() {},
          async kill() {},
        };
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      async getPortEndpoint() {
        return { url: 'ws://sandbox.example' };
      },
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    const harness = createOpenCode({
      provider: 'openai',
      auth: { OPENAI_API_KEY: 'openai-secret' },
      credentialForwarding: options => {
        forwardedCredentials.push(options);
        return 'caller-managed-credential';
      },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/workspace/project',
    });

    expect(forwardedCredentials).toEqual([
      {
        credential: 'openai-secret',
        environmentVariableName: 'OPENAI_API_KEY',
      },
    ]);
    expect(spawnEnvs.at(0)?.OPENAI_API_KEY).toBe('caller-managed-credential');
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('openai-secret');
    expect(warn).not.toHaveBeenCalled();

    await session.doDetach();

    const identityHarness = createOpenCode({
      provider: 'openai',
      auth: { OPENAI_API_KEY: 'openai-secret' },
      credentialForwarding: ({ credential }) => credential,
    });
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const identitySession = await identityHarness.doStart({
      sessionId: 's2',
      sandboxSession,
      sessionWorkDir: '/workspace/project-2',
    });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );

    await identitySession.doDetach();
    warn.mockRestore();
  });

  it('writes skills under sandbox HOME and starts OpenCode with that HOME', async () => {
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const runCommands: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const sandbox = {
      async run({ command }: { command: string }) {
        runCommands.push(command);
        if (command === 'printf "%s" "$HOME"') {
          return {
            exitCode: 0,
            stdout: '/home/vercel-sandbox',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      async writeTextFile({
        path,
        content,
      }: {
        path: string;
        content: string;
      }) {
        writes.push({ path, content });
      },
      async readTextFile() {
        return null;
      },
      async spawn({
        command,
        env,
      }: {
        command: string;
        env: Record<string, string | undefined>;
      }) {
        spawns.push({ command, env });
        return {
          async wait() {},
          async kill() {},
        } as never;
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      async getPortEndpoint() {
        return { url: 'ws://sandbox.example' };
      },
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;

    const session = await createOpenCode().doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/workspace/project',
    });
    await session.doPromptTurn({
      skills: [
        {
          name: 'demo',
          description: 'Demo skill.',
          content: 'Use reference.md.',
          files: [{ path: 'reference.md', content: '# Reference' }],
        },
      ],
      tools: [],
      prompt: 'Use demo.',
      emit: () => {},
    });

    expect(runCommands).toContain('printf "%s" "$HOME"');
    expect(runCommands).toContain(
      "mkdir -p '/home/vercel-sandbox/.agents/skills'",
    );
    const skillWrites = writes.filter(write => write.path.includes('/demo/'));
    expect(skillWrites).toEqual(
      expect.arrayContaining([
        {
          path: '/home/vercel-sandbox/.agents/skills/demo/SKILL.md',
          content:
            '---\nname: demo\ndescription: Demo skill.\n---\n\nUse reference.md.',
        },
        {
          path: '/home/vercel-sandbox/.agents/skills/demo/reference.md',
          content: '# Reference',
        },
      ]),
    );
    expect(skillWrites).toHaveLength(2);
    expect(writes.some(write => write.path.includes('/.opencode/'))).toBe(
      false,
    );
    expect(
      writes.some(write => write.path.startsWith('/workspace/project/')),
    ).toBe(false);
    expect(spawns.at(-1)?.env).not.toHaveProperty('HOME');
    expect(spawns.at(-1)?.env).not.toHaveProperty('USERPROFILE');
    expect(spawns.at(-1)?.env).not.toHaveProperty('XDG_CONFIG_HOME');
    expect(spawns.at(-1)?.env).not.toHaveProperty('XDG_CACHE_HOME');
    expect(spawns.at(-1)?.env).not.toHaveProperty('XDG_DATA_HOME');
    expect(spawns.at(-1)?.env).not.toHaveProperty('XDG_STATE_HOME');
    expect(spawns.at(-1)?.env.AI_SDK_HARNESS_CLIENT_APP).toBe(
      'ai-sdk/harness-opencode/0.0.0-test',
    );
    expect(spawns.at(-1)?.env.BRIDGE_CHANNEL_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    expect(spawns.at(-1)?.command).toContain(
      "node '/workspace/.harness-bootstrap/opencode/bridge.mjs'",
    );
    expect(spawns.at(-1)?.command).toContain(
      "--bootstrap-dir '/workspace/.harness-bootstrap/opencode'",
    );
    expect(spawns.at(-1)?.command).toContain(
      "--skills-dir '/home/vercel-sandbox/.agents/skills'",
    );
    await session.doDestroy();
  });

  it('passes native config through prompts, compaction, and resumed sessions', async () => {
    harnessUtilsMocks.channels.length = 0;
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const sandbox = {
      async run({ command }: { command: string }) {
        if (command === 'printf "%s" "$HOME"') {
          return {
            exitCode: 0,
            stdout: '/home/vercel-sandbox',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      async readTextFile() {
        return null;
      },
      async writeTextFile() {},
      async spawn() {
        return {
          stdout: emptyStream(),
          stderr: emptyStream(),
          async wait() {},
          async kill() {},
        };
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      async getPortEndpoint() {
        return { url: 'ws://sandbox.example' };
      },
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;

    const mcpServers = {
      context7: {
        type: 'remote',
        url: 'https://mcp.context7.com/mcp',
      },
    };
    const openCodeConfig = {
      agent: { general: { model: 'openai/gpt-5.4-mini' } },
    };
    const harness = createOpenCode({
      auth: { AI_GATEWAY_API_KEY: 'gateway-key' },
      model: 'legacy-model',
      openCodeConfig,
      reasoningVariant: 'high',
      mcpServers,
    });
    const session = await harness.doStart({
      sessionId: 's1',
      headers: { 'x-tenant': 'acme' },
      sandboxSession,
      sessionWorkDir: '/workspace/project',
    });
    const channel = harnessUtilsMocks.channels.at(-1)!;
    channel.emit('bridge-thread', {
      type: 'bridge-thread',
      threadId: 'opencode-session',
    });

    const compaction = session.doCompact();
    expect(channel.sent.at(-1)).toMatchObject({
      type: 'start',
      operation: 'compact',
      openCodeConfig,
      mcpServers,
      headers: { 'x-tenant': 'acme' },
      resumeSessionId: 'opencode-session',
    });
    channel.emit('finish', { type: 'finish' });
    await compaction;

    const firstTurn = await session.doPromptTurn({
      model: 'anthropic/agent-model',
      skills: [],
      tools: [],
      prompt: 'think',
      instructions: 'be concise',
      emit: () => {},
    });

    expect(channel.sent.at(-1)).toMatchObject({
      type: 'start',
      operation: 'prompt',
      prompt: 'think',
      instructions: 'be concise',
      model: 'anthropic/agent-model',
      variant: 'high',
      openCodeConfig,
      mcpServers,
      headers: { 'x-tenant': 'acme' },
      resumeSessionId: 'opencode-session',
    });
    channel.emit('finish', { type: 'finish' });
    await firstTurn.done;

    const resumeFrom = await session.doDetach();
    const resumedSession = await harness.doStart({
      sessionId: 's1',
      headers: { 'x-tenant': 'acme' },
      sandboxSession,
      sessionWorkDir: '/workspace/project',
      resumeFrom,
    });
    const resumedTurn = await resumedSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'resume thinking',
      instructions: 'be concise',
      emit: () => {},
    });
    const resumedChannel = harnessUtilsMocks.channels.at(-1)!;

    expect(resumedChannel.sent.at(-1)).toMatchObject({
      type: 'start',
      operation: 'prompt',
      prompt: 'resume thinking',
      instructions: 'be concise',
      variant: 'high',
      openCodeConfig,
      mcpServers,
      headers: { 'x-tenant': 'acme' },
      resumeSessionId: 'opencode-session',
    });
    resumedChannel.emit('finish', { type: 'finish' });
    await resumedTurn.done;

    await resumedSession.doDestroy();
  });

  it('waits for the bridge to accept a steering message', async () => {
    harnessUtilsMocks.channels.length = 0;
    harnessUtilsMocks.connectOnOpen = true;
    harnessUtilsMocks.waitForBridgeReady.mockResolvedValueOnce({ port: 4000 });
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const sandbox = {
      async run({ command }: { command: string }) {
        return command === 'printf "%s" "$HOME"'
          ? { exitCode: 0, stdout: '/home/vercel-sandbox', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' };
      },
      async readTextFile() {
        return null;
      },
      async writeTextFile() {},
      async spawn() {
        return {
          stdout: emptyStream(),
          stderr: emptyStream(),
          async wait() {},
          async kill() {},
        };
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      async getPortEndpoint() {
        return { url: 'ws://sandbox.example' };
      },
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    const session = await createOpenCode().doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/workspace/project',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Weather in Paris?',
      emit: () => {},
    });
    const channel = harnessUtilsMocks.channels.at(-1)!;
    const steering = control.submitUserMessage?.('Actually, Paris, Texas.');
    const request = channel.sent.find(
      (message): message is Record<string, unknown> =>
        message != null &&
        typeof message === 'object' &&
        Reflect.get(message, 'type') === 'user-message',
    );

    expect(request).toMatchObject({
      type: 'user-message',
      text: 'Actually, Paris, Texas.',
      messageId: expect.any(String),
    });
    channel.emit('user-message-response', {
      type: 'user-message-response',
      messageId: request!.messageId,
      accepted: true,
    });
    await expect(steering).resolves.toBeUndefined();
    channel.emit('finish', {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: {},
    });
    await control.done;
    await session.doDestroy();
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createOpenCode();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('opencode');
      expect(recipe.bootstrapDir).toBe('.harness-bootstrap/opencode');
    });

    it('includes bridge assets under the bootstrap dir', async () => {
      const harness = createOpenCode();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(file => file.path).sort();
      expect(paths).toEqual([
        '.harness-bootstrap/opencode/bridge.mjs',
        '.harness-bootstrap/opencode/host-tool-mcp.mjs',
        '.harness-bootstrap/opencode/package.json',
        '.harness-bootstrap/opencode/pnpm-lock.yaml',
        '.harness-bootstrap/opencode/pnpm-workspace.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
      const packageJson = recipe.files.find(file =>
        file.path.endsWith('/package.json'),
      );
      const workspace = recipe.files.find(file =>
        file.path.endsWith('/pnpm-workspace.yaml'),
      );
      if (packageJson == null || workspace == null) {
        throw new Error('OpenCode bootstrap package assets are missing.');
      }
      const bridgeManifest = JSON.parse(packageJson.content) as {
        dependencies: { 'opencode-ai': string };
      };
      expect(workspace.content).toBe(
        `allowBuilds:\n  'opencode-ai@${bridgeManifest.dependencies['opencode-ai']}': true\n`,
      );
    });

    it('allows the pinned OpenCode build and verifies the installed CLI', async () => {
      const harness = createOpenCode();
      const recipe = await harness.getBootstrap!();
      expect(recipe.commands[0]).toEqual({
        command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      });
      expect(recipe.commands).toContainEqual({
        command: './node_modules/.bin/opencode --version',
      });
    });

    it('shares the getter across configured harness instances', () => {
      const first = createOpenCode({ model: 'first-model' });
      const second = createOpenCode({ model: 'second-model' });

      expect(first.getBootstrap).toBe(second.getBootstrap);
    });
  });
});
