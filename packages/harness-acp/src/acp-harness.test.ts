import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
  type HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import { safeParseJSON, safeValidateTypes, tool } from '@ai-sdk/provider-utils';
import * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { createACP } from './acp-harness';
import { serializeBuiltinTools } from './v1/acp-v1-harness';
import { ACP_BRIDGE_CONFIGURATION_ENV } from './v1/bridge/acp-v1-bridge-environment';
import type { ACPPermissionModeMapping } from './v1/acp-v1-settings';

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

const harnessUtilsMocks = vi.hoisted(() => {
  const channels: FakeSandboxChannel[] = [];
  class FakeSandboxChannel {
    readonly sent: unknown[] = [];
    readonly options: {
      initialLastSeenEventId?: number;
      connect: () => Promise<unknown>;
    };
    openOptions: { resume?: boolean } | undefined;
    private readonly listeners = new Map<
      string,
      Set<(event: { type: string; [key: string]: unknown }) => void>
    >();
    private readonly buffered = new Map<
      string,
      Array<{ type: string; [key: string]: unknown }>
    >();
    private readonly closeHandlers = new Set<
      (code: number, reason: string) => void
    >();
    private closed = false;

    constructor(options: {
      initialLastSeenEventId?: number;
      connect: () => Promise<unknown>;
    }) {
      this.options = options;
      channels.push(this);
    }

    async open(options?: { resume?: boolean }): Promise<void> {
      this.openOptions = options;
      const error = harnessUtilsMocks.openErrors.shift();
      if (error != null) throw error;
      if (harnessUtilsMocks.connectOnOpen) await this.options.connect();
    }
    on(
      type: string,
      listener: (event: { type: string; [key: string]: unknown }) => void,
    ): () => void {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
      const buffered = this.buffered.get(type);
      if (buffered != null) {
        this.buffered.delete(type);
        for (const event of buffered) listener(event);
      }
      return () => listeners.delete(listener);
    }
    onClose(handler: (code: number, reason: string) => void): void {
      this.closeHandlers.add(handler);
    }
    send(message: unknown): void {
      this.sent.push(message);
      if (message == null || typeof message !== 'object') return;
      const type = Reflect.get(message, 'type');
      if (type === 'destroy') {
        queueMicrotask(() => this.emitClose({ reason: type }));
      }
      if (type === 'stop') {
        queueMicrotask(() => {
          this.emit({ type: 'bridge-stop', data: {} });
          this.emitClose({ reason: type });
        });
      }
    }
    emit(event: { type: string; [key: string]: unknown }): void {
      const listeners = this.listeners.get(event.type);
      if (listeners == null || listeners.size === 0) {
        const buffered = this.buffered.get(event.type) ?? [];
        buffered.push(event);
        this.buffered.set(event.type, buffered);
        return;
      }
      for (const listener of listeners) {
        listener(event);
      }
    }
    emitClose({
      code = 1000,
      reason = 'closed',
    }: {
      code?: number;
      reason?: string;
    } = {}): void {
      if (this.closed) return;
      this.closed = true;
      for (const handler of this.closeHandlers) handler(code, reason);
    }
    beginClose(): void {}
    isClosed(): boolean {
      return this.closed;
    }
    close(): void {
      this.emitClose({});
    }
    async suspend(): Promise<number> {
      const cursor = harnessUtilsMocks.nextSuspensionCursor;
      this.emitClose({ reason: 'suspended' });
      return cursor;
    }
  }
  return {
    markBridgeStarting: vi.fn(),
    waitForBridgeReady: vi.fn(async () => ({ port: 4319 })),
    SandboxChannel: FakeSandboxChannel,
    channels,
    connectOnOpen: false,
    openErrors: [] as Error[],
    nextSuspensionCursor: 0,
  };
});

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  return {
    ...actual,
    markBridgeStarting: harnessUtilsMocks.markBridgeStarting,
    waitForBridgeReady: harnessUtilsMocks.waitForBridgeReady,
    SandboxChannel: harnessUtilsMocks.SandboxChannel,
  };
});

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const path = typeof input === 'string' ? input : String(input);
      if (path.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (path.endsWith('/bridge/host-tool-mcp.mjs'))
        return '// mock host tool MCP\n';
      if (path.endsWith('/bridge/package.json'))
        return '{"name":"@ai-sdk/harness-acp-bridge"}\n';
      if (path.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      const readFile = actual.readFile as unknown as (
        ...args: unknown[]
      ) => Promise<unknown>;
      return readFile(input, ...rest);
    }),
  };
});

const agentSettings = {
  source: {
    type: 'npm-simple',
    packageName: '@agentclientprotocol/codex-acp',
    packageVersion: '1.1.4',
  },
  executable: 'codex-acp',
  args: ['--example'],
  forwardEnv: ['CODEX_API_KEY'],
  modelMapping: {
    type: 'session-config-option' as const,
    path: 'model',
  },
} as const;

const permissionModeMapping = {
  'allow-reads': { type: 'session-mode', modeId: 'read-only' },
  'allow-edits': { type: 'session-mode', modeId: 'agent' },
  'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
} as const satisfies ACPPermissionModeMapping;

const lockedPackageJson = `{
  "name": "locked-codex-acp",
  "private": true,
  "dependencies": {
    "@agentclientprotocol/codex-acp": "1.1.4"
  }
}
`;
const lockedPnpmLockYaml = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@agentclientprotocol/codex-acp':
        specifier: 1.1.4
        version: 1.1.4
`;

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text.length > 0) {
        controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}

function fakeSandbox({
  runs,
  spawns,
  stop,
  writes = [],
  kills,
  files = {},
  homeDir = '/home/agent',
  bridgePortEndpoint = { url: 'ws://127.0.0.1:4319' },
  addRequestTransformations,
}: {
  runs: string[];
  spawns: Array<{
    command: string;
    env: Record<string, string | undefined>;
  }>;
  stop: () => Promise<void>;
  writes?: Array<{ path: string; content: string }>;
  kills?: string[];
  files?: Readonly<Record<string, string>>;
  homeDir?: string;
  bridgePortEndpoint?: HarnessV1PortEndpoint;
  addRequestTransformations?: HarnessV1NetworkSandboxSession['addRequestTransformations'];
}): HarnessV1NetworkSandboxSession {
  const storedFiles = new Map(Object.entries(files));
  const restricted = {
    readTextFile: async ({ path }: { path: string }) =>
      files[path] ?? storedFiles.get(path) ?? null,
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      writes.push({ path, content });
      storedFiles.set(path, content);
    },
    run: async ({ command }: { command: string }) => {
      runs.push(command);
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: homeDir, stderr: '' };
      }
      if (command === 'pwd') {
        return { exitCode: 0, stdout: '/workspace\n', stderr: '' };
      }
      const manifestMove = command.match(/^mv -f '([^']+)' '([^']+)'$/);
      if (manifestMove != null) {
        const content = storedFiles.get(manifestMove[1]!);
        if (content != null) storedFiles.set(manifestMove[2]!, content);
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    spawn: async ({
      command,
      env,
    }: {
      command: string;
      env: Record<string, string | undefined>;
    }) => {
      spawns.push({ command, env });
      return {
        stdout: textStream(''),
        stderr: textStream(''),
        wait: async () => ({ exitCode: 0 }),
        kill: async () => {
          kills?.push(command);
        },
      };
    },
  };
  return {
    id: 'sandbox-1',
    defaultWorkingDirectory: '/workspace',
    ports: [4319],
    restricted: () => restricted,
    getPortEndpoint: async () => bridgePortEndpoint,
    getPortUrl: async () => 'ws://127.0.0.1:4319',
    stop,
    ...(addRequestTransformations == null ? {} : { addRequestTransformations }),
    ...restricted,
  } as unknown as HarnessV1NetworkSandboxSession;
}

function sandboxProvider({
  session,
}: {
  session: HarnessV1NetworkSandboxSession;
}): HarnessV1SandboxProvider {
  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'acp-test-sandbox',
    createSession: async () => session,
    resumeSession: async () => session,
  };
}

async function collectStream({
  stream,
}: {
  stream: AsyncIterable<unknown>;
}): Promise<unknown[]> {
  const parts: unknown[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

function isMessageType({
  message,
  type,
}: {
  message: unknown;
  type: string;
}): boolean {
  return (
    message != null &&
    typeof message === 'object' &&
    Reflect.get(message, 'type') === type
  );
}

function isPreliminaryToolResult(value: unknown): value is {
  type: 'tool-result';
  preliminary: true;
  output: unknown;
} {
  return (
    isMessageType({ message: value, type: 'tool-result' }) &&
    Reflect.get(value as object, 'preliminary') === true
  );
}

function unknownUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

function emitColdRestoration({
  channel,
  method,
  sessionId = 'acp-session-1',
}: {
  channel: InstanceType<typeof harnessUtilsMocks.SandboxChannel>;
  method: 'resume' | 'load';
  sessionId?: string;
}): void {
  channel.emit({
    type: 'bridge-thread',
    threadId: sessionId,
  });
  channel.emit({
    type: 'raw',
    rawValue: {
      type: 'acp-session-restored',
      method,
    },
  });
  channel.emit({
    type: 'finish',
    finishReason: {
      unified: 'stop',
      raw: 'acp-session-restored',
    },
    totalUsage: unknownUsage(),
  });
}

describe('createACP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CODEX_API_KEY', 'test-key');
    harnessUtilsMocks.channels.length = 0;
    harnessUtilsMocks.openErrors.length = 0;
    harnessUtilsMocks.nextSuspensionCursor = 0;
    harnessUtilsMocks.connectOnOpen = false;
    webSocketMocks.calls.length = 0;
  });

  it('translates ACP question requests and client results', async () => {
    const fromNativeRequest = vi.fn(
      ({ nativeRequest }: { nativeRequest: unknown }) => ({
        type: 'tool-call' as const,
        toolCallId: 'question-1',
        toolName: 'askUserQuestions',
        input: JSON.stringify({
          allowPartialAnswers: false,
          questions: [{ id: 'q1', question: 'Framework?' }],
        }),
        providerExecuted: false,
        providerMetadata: {
          test: { preserved: true },
        },
      }),
    );
    const toNativeResponse = vi.fn(
      ({ toolResult }: { toolResult: unknown }) => ({
        native: toolResult,
      }),
    );
    const harness = createACP({
      harnessId: 'test-acp',
      ...agentSettings,
      askUserQuestions: {
        requestMethod: 'test/ask',
        fromNativeRequest,
        toNativeResponse,
      },
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const events: unknown[] = [];
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Ask.',
      emit: event => events.push(event),
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const nativeRequest = {
      sessionId: 'native-session',
      toolCallId: 'native-question-1',
    };

    channel.emit({
      type: 'acp-question-request',
      requestId: 'request-1',
      nativeRequest,
    });

    expect(fromNativeRequest).toHaveBeenCalledWith({
      nativeRequest,
      nativeToolCall: undefined,
    });
    expect(events).toContainEqual({
      type: 'tool-call',
      toolCallId: 'question-1',
      toolName: 'askUserQuestions',
      input: JSON.stringify({
        allowPartialAnswers: false,
        questions: [{ id: 'q1', question: 'Framework?' }],
      }),
      providerExecuted: false,
      providerMetadata: {
        test: { preserved: true },
        'test-acp': { nativeRequest },
      },
    });
    expect(channel.sent).toContainEqual({
      type: 'tool-result',
      toolCallId: 'request-1',
      output: { type: 'handled', toolCallId: 'question-1' },
    });

    const toolResult = {
      type: 'tool-result' as const,
      toolCallId: 'question-1',
      toolName: 'askUserQuestions',
      output: {
        type: 'json' as const,
        value: {
          action: 'answered',
          answers: { q1: { optionIds: [] } },
        },
      },
    };
    await control.submitToolResult({
      toolCallId: 'question-1',
      output: toolResult.output.value,
      toolResult,
    });

    expect(toNativeResponse).toHaveBeenCalledWith({
      nativeRequest,
      toolResult,
    });
    expect(channel.sent).toContainEqual({
      type: 'tool-result',
      toolCallId: 'question-1',
      output: { native: toolResult },
      isError: undefined,
      toolResult,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('constructs the default v1 harness synchronously without reading assets', () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });

    expect(harness).not.toBeInstanceOf(Promise);
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.harnessId).toBe('codex-acp');
    expect(harness.builtinTools).toEqual({});
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBe(false);
    expect(vi.mocked(fsPromises.readFile)).not.toHaveBeenCalled();
  });

  it('accepts explicit v1 selection', () => {
    expect(
      createACP({
        version: 'v1',
        harnessId: 'codex-acp',
        ...agentSettings,
      }).specificationVersion,
    ).toBe('harness-v1');
  });

  it('maps the HarnessAgent model into per-turn session settings', async () => {
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'model-mapping-acp',
      ...agentSettings,
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs,
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const control = await session.doPromptTurn({
      model: 'agent-model',
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });

    expect(harnessUtilsMocks.channels[0]!.sent[0]).toMatchObject({
      type: 'start',
      model: 'agent-model',
      modelMapping: {
        type: 'session-config-option',
        path: 'model',
      },
    });
    harnessUtilsMocks.channels[0]!.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await control.done;

    await session.doDestroy();
  });

  it('uses the deprecated ACP modelId as a model fallback', async () => {
    const harness = createACP({
      harnessId: 'legacy-model-mapping-acp',
      ...agentSettings,
      modelId: 'legacy-model',
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Hello',
      emit: () => {},
    });

    expect(harnessUtilsMocks.channels[0]!.sent[0]).toMatchObject({
      type: 'start',
      model: 'legacy-model',
      modelMapping: {
        type: 'session-config-option',
        path: 'model',
      },
    });
    harnessUtilsMocks.channels[0]!.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await control.done;
    await session.doDestroy();
  });

  it('requires credential environment and brokering settings together', () => {
    expect(() =>
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        credentialEnv: ['CODEX_API_KEY'],
      }),
    ).toThrow(
      'ACP credentialEnv and credentialBrokering must be configured together.',
    );
    expect(() =>
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        credentialBrokering: () => [],
      }),
    ).toThrow(
      'ACP credentialEnv and credentialBrokering must be configured together.',
    );
  });

  it('brokers direct credentials before launching the sandbox bridge', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    vi.stubEnv('PROVIDER_BASE_URL', 'https://provider.example/v1');
    const addRequestTransformations = vi.fn(async () => {});
    const credentialBrokering = vi.fn(
      ({
        env,
        sandboxEnv,
      }: {
        env: Readonly<Record<string, string>>;
        sandboxEnv?: Readonly<Record<string, string>>;
      }) => {
        if (sandboxEnv?.PROVIDER_API_KEY == null) return [];
        return [
          {
            match: {
              host: 'provider.example',
              path: { startsWith: '/v1' },
              headers: [
                {
                  key: { exact: 'Authorization' },
                  value: {
                    exact: `Bearer ${sandboxEnv.PROVIDER_API_KEY}`,
                  },
                },
              ],
            },
            transform: {
              headers: { Authorization: `Bearer ${env.PROVIDER_API_KEY}` },
            },
          },
        ];
      },
    );
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const credentialForwarding = vi.fn(
      async ({
        environmentVariableName,
      }: {
        environmentVariableName: string;
      }) => `ephemeral-${environmentVariableName}`,
    );
    const harness = createACP({
      harnessId: 'direct-brokered-acp',
      ...agentSettings,
      forwardEnv: ['PROVIDER_BASE_URL'],
      credentialEnv: ['PROVIDER_API_KEY'],
      credentialBrokering,
      credentialForwarding,
      env: { STATIC_SETTING: 'literal-value' },
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
        addRequestTransformations,
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(credentialBrokering).toHaveBeenCalledWith({
      env: {
        PROVIDER_API_KEY: 'direct-secret',
        PROVIDER_BASE_URL: 'https://provider.example/v1',
        STATIC_SETTING: 'literal-value',
      },
      sandboxEnv: {
        PROVIDER_API_KEY: 'ephemeral-PROVIDER_API_KEY',
        PROVIDER_BASE_URL: 'https://provider.example/v1',
        STATIC_SETTING: 'literal-value',
      },
    });
    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'provider.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer ephemeral-PROVIDER_API_KEY' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer direct-secret' },
        },
      },
    ]);
    expect(spawns[0]!.env).toMatchObject({
      PROVIDER_API_KEY: 'ephemeral-PROVIDER_API_KEY',
      PROVIDER_BASE_URL: 'https://provider.example/v1',
      STATIC_SETTING: 'literal-value',
    });
    expect(credentialForwarding).toHaveBeenCalledExactlyOnceWith({
      credential: expect.stringMatching(/^aisdkhc_[A-Za-z0-9_-]{43}$/),
      environmentVariableName: 'PROVIDER_API_KEY',
    });
    expect(JSON.stringify(spawns[0]!.env)).not.toContain('direct-secret');

    await session.doDestroy();
  });

  it('uses resolved Gateway profile values for brokering without serializing the credential', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example');
    const addRequestTransformations = vi.fn(async () => {});
    const credentialBrokering = vi.fn(
      ({
        env,
        sandboxEnv,
      }: {
        env: Readonly<Record<string, string>>;
        sandboxEnv?: Readonly<Record<string, string>>;
      }) => {
        if (sandboxEnv?.PROVIDER_API_KEY == null) return [];
        return [
          {
            match: {
              host: 'gateway.example',
              path: { startsWith: '/v1' },
              headers: [
                {
                  key: { exact: 'Authorization' },
                  value: {
                    exact: `Bearer ${sandboxEnv.PROVIDER_API_KEY}`,
                  },
                },
              ],
            },
            transform: {
              headers: { Authorization: `Bearer ${env.PROVIDER_API_KEY}` },
            },
          },
        ];
      },
    );
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const credentialForwarding = vi.fn(
      async ({
        environmentVariableName,
      }: {
        environmentVariableName: string;
      }) => `ephemeral-${environmentVariableName}`,
    );
    const harness = createACP({
      harnessId: 'gateway-brokered-acp',
      auth: 'ai-gateway',
      ...agentSettings,
      forwardEnv: [],
      credentialEnv: ['PROVIDER_API_KEY'],
      credentialBrokering,
      credentialForwarding,
      providerAuthentication: {
        gateway: {
          env: {
            PROVIDER_API_KEY: { $source: 'gateway-api-key' },
            PROVIDER_BASE_URL: {
              $source: 'gateway-base-url',
              ensureSuffix: '/v1',
            },
          },
        },
      },
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      headers: { 'x-tenant': 'acme' },
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
        addRequestTransformations,
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(credentialBrokering).toHaveBeenCalledWith({
      env: {
        PROVIDER_API_KEY: 'gateway-secret',
        PROVIDER_BASE_URL: 'https://gateway.example/v1',
      },
      sandboxEnv: {
        PROVIDER_API_KEY: 'ephemeral-PROVIDER_API_KEY',
        PROVIDER_BASE_URL: 'https://gateway.example/v1',
      },
      headers: { 'x-tenant': 'acme' },
    });
    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'gateway.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer ephemeral-PROVIDER_API_KEY' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer gateway-secret' },
        },
      },
    ]);
    expect(spawns[0]!.env.PROVIDER_API_KEY).toBe('ephemeral-PROVIDER_API_KEY');
    expect(spawns[0]!.env.PROVIDER_BASE_URL).toBe('https://gateway.example/v1');
    expect(spawns[0]!.env.AI_SDK_ACP_GATEWAY_API_KEY).toBeUndefined();
    expect(JSON.stringify(spawns[0]!.env)).not.toContain('gateway-secret');
    await expect(
      safeParseJSON({
        text: spawns[0]!.env[ACP_BRIDGE_CONFIGURATION_ENV]!,
      }),
    ).resolves.toMatchObject({
      success: true,
      value: {
        providerAuthentication: { type: 'ai-gateway' },
        providerEnvironment: {},
      },
    });
    expect(credentialForwarding).toHaveBeenCalledExactlyOnceWith({
      credential: expect.stringMatching(/^aisdkhc_[A-Za-z0-9_-]{43}$/),
      environmentVariableName: 'PROVIDER_API_KEY',
    });

    await session.doDestroy();
  });

  it('uses the exposed environment variable name for brokered Gateway credentials', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret');
    const addRequestTransformations = vi.fn(async () => {});
    const credentialBrokering = vi.fn(
      ({
        env,
        sandboxEnv,
      }: {
        env: Readonly<Record<string, string>>;
        sandboxEnv?: Readonly<Record<string, string>>;
      }) => {
        if (sandboxEnv?.RUNTIME_PROVIDER_API_KEY == null) return [];
        return [
          {
            match: {
              host: 'gateway.example',
              headers: [
                {
                  key: { exact: 'Authorization' },
                  value: {
                    exact: `Bearer ${sandboxEnv.RUNTIME_PROVIDER_API_KEY}`,
                  },
                },
              ],
            },
            transform: {
              headers: {
                Authorization: `Bearer ${env.RUNTIME_PROVIDER_API_KEY}`,
              },
            },
          },
        ];
      },
    );
    const credentialForwarding = vi.fn(
      async ({ credential }: { credential: string }) => credential,
    );
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'renamed-gateway-credential-acp',
      auth: 'ai-gateway',
      ...agentSettings,
      forwardEnv: [],
      credentialEnv: [],
      credentialBrokering,
      credentialForwarding,
      providerAuthentication: {
        gateway: {
          env: {
            RUNTIME_PROVIDER_API_KEY: { $source: 'gateway-api-key' },
          },
        },
      },
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
        addRequestTransformations,
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    const sandboxCredentialEnvironment = credentialBrokering.mock.calls[0]![0]
      .sandboxEnv as Readonly<Record<string, string>>;
    expect(sandboxCredentialEnvironment.RUNTIME_PROVIDER_API_KEY).toMatch(
      /^aisdkhc_[A-Za-z0-9_-]{43}$/,
    );
    expect(credentialBrokering).toHaveBeenCalledWith({
      env: {
        RUNTIME_PROVIDER_API_KEY: 'gateway-secret',
      },
      sandboxEnv: sandboxCredentialEnvironment,
    });
    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'gateway.example',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: {
                exact: `Bearer ${sandboxCredentialEnvironment.RUNTIME_PROVIDER_API_KEY}`,
              },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer gateway-secret' },
        },
      },
    ]);
    expect(credentialForwarding).toHaveBeenCalledExactlyOnceWith({
      credential: sandboxCredentialEnvironment.RUNTIME_PROVIDER_API_KEY,
      environmentVariableName: 'RUNTIME_PROVIDER_API_KEY',
    });
    expect(spawns[0]!.env.RUNTIME_PROVIDER_API_KEY).toBe(
      sandboxCredentialEnvironment.RUNTIME_PROVIDER_API_KEY,
    );
    expect(spawns[0]!.env.AI_SDK_ACP_GATEWAY_API_KEY).toBeUndefined();
    expect(JSON.stringify(spawns[0]!.env)).not.toContain('gateway-secret');

    await session.doDestroy();
  });

  it('persists sandbox credentials and reinstalls the same matchers across process resumes', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    const addRequestTransformations = vi.fn(
      async (
        _transformations: Parameters<
          NonNullable<
            HarnessV1NetworkSandboxSession['addRequestTransformations']
          >
        >[0],
      ) => {},
    );
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const sandboxSession = fakeSandbox({
      runs: [],
      spawns,
      stop: async () => {},
      addRequestTransformations,
    });
    const createHarness = () =>
      createACP({
        harnessId: 'resumable-brokered-acp',
        ...agentSettings,
        forwardEnv: [],
        credentialEnv: ['PROVIDER_API_KEY'],
        credentialBrokering: ({ env, sandboxEnv }) => {
          if (sandboxEnv?.PROVIDER_API_KEY == null) return [];
          return [
            {
              match: {
                host: 'provider.example',
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: {
                      exact: `Bearer ${sandboxEnv.PROVIDER_API_KEY}`,
                    },
                  },
                ],
              },
              transform: {
                headers: {
                  Authorization: `Bearer ${env.PROVIDER_API_KEY}`,
                },
              },
            },
          ];
        },
      });

    const firstSession = await createHarness().doStart({
      sessionId: 'session-1',
      sandboxSession,
      sessionWorkDir: '/workspace/user-project',
    });
    const resumeFrom = await firstSession.doDetach();
    const persistedEnvironment = (
      resumeFrom.data as {
        sandboxCredentialEnvironment?: Readonly<Record<string, string>>;
      }
    ).sandboxCredentialEnvironment;

    expect(persistedEnvironment?.PROVIDER_API_KEY).toMatch(
      /^aisdkhc_[A-Za-z0-9_-]{43}$/,
    );
    expect(spawns[0]!.env.PROVIDER_API_KEY).toBe(
      persistedEnvironment?.PROVIDER_API_KEY,
    );
    expect(JSON.stringify(resumeFrom)).not.toContain('direct-secret');

    const resumedSession = await createHarness().doStart({
      sessionId: 'session-1',
      sandboxSession,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom: JSON.parse(JSON.stringify(resumeFrom)),
    });

    expect(spawns).toHaveLength(1);
    expect(addRequestTransformations).toHaveBeenCalledTimes(2);
    expect(addRequestTransformations.mock.calls[1]).toEqual(
      addRequestTransformations.mock.calls[0],
    );
    expect(addRequestTransformations.mock.calls[1]![0]).toEqual([
      {
        match: {
          host: 'provider.example',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: {
                exact: `Bearer ${persistedEnvironment?.PROVIDER_API_KEY}`,
              },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer direct-secret' },
        },
      },
    ]);

    await resumedSession.doDestroy();
  });

  it('preserves real credential forwarding when additive transformations are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('PROVIDER_API_KEY', 'legacy-secret');
    const credentialBrokering = vi.fn(() => []);
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'legacy-credentials-acp',
      ...agentSettings,
      forwardEnv: [],
      credentialEnv: ['PROVIDER_API_KEY'],
      credentialBrokering,
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(credentialBrokering).not.toHaveBeenCalled();
    expect(spawns[0]!.env.PROVIDER_API_KEY).toBe('legacy-secret');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );

    await session.doDestroy();
    warn.mockRestore();
  });

  it('customizes direct and Gateway credentials under their sandbox environment names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret');
    const credentialBrokering = vi.fn(() => []);
    const credentialForwarding = vi.fn(
      async ({ credential }: { credential: string }) =>
        credential === 'gateway-secret'
          ? 'ephemeral-gateway-credential'
          : 'ephemeral-direct-credential',
    );
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'custom-forwarding-acp',
      auth: 'ai-gateway',
      ...agentSettings,
      forwardEnv: [],
      credentialEnv: ['PROVIDER_API_KEY'],
      credentialBrokering,
      credentialForwarding,
      providerAuthentication: {
        gateway: {
          env: {
            RUNTIME_PROVIDER_API_KEY: { $source: 'gateway-api-key' },
          },
        },
      },
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(credentialBrokering).not.toHaveBeenCalled();
    expect(credentialForwarding).toHaveBeenNthCalledWith(1, {
      credential: 'direct-secret',
      environmentVariableName: 'PROVIDER_API_KEY',
    });
    expect(credentialForwarding).toHaveBeenNthCalledWith(2, {
      credential: 'gateway-secret',
      environmentVariableName: 'RUNTIME_PROVIDER_API_KEY',
    });
    expect(spawns[0]!.env.PROVIDER_API_KEY).toBe('ephemeral-direct-credential');
    expect(spawns[0]!.env.RUNTIME_PROVIDER_API_KEY).toBe(
      'ephemeral-gateway-credential',
    );
    expect(spawns[0]!.env.AI_SDK_ACP_GATEWAY_API_KEY).toBeUndefined();
    await expect(
      safeParseJSON({
        text: spawns[0]!.env[ACP_BRIDGE_CONFIGURATION_ENV]!,
      }),
    ).resolves.toMatchObject({
      success: true,
      value: {
        providerEnvironment: {},
      },
    });
    expect(warn).not.toHaveBeenCalled();

    await session.doDestroy();
    warn.mockRestore();
  });

  it('aborts before spawning when credential forwarding fails', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    const error = new Error('credential forwarding failed');
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'failed-forwarding-acp',
      ...agentSettings,
      forwardEnv: [],
      credentialEnv: ['PROVIDER_API_KEY'],
      credentialBrokering: () => [],
      credentialForwarding: async () => {
        throw error;
      },
    });

    await expect(
      harness.doStart({
        sessionId: 'session-1',
        sandboxSession: fakeSandbox({
          runs: [],
          spawns,
          stop: async () => {},
        }),
        sessionWorkDir: '/workspace/user-project',
      }),
    ).rejects.toBe(error);
    expect(spawns).toEqual([]);
  });

  it('aborts before attach or spawn when credential brokering fails', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    const error = new Error('request transformation installation failed');
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'failed-brokering-acp',
      ...agentSettings,
      forwardEnv: [],
      credentialEnv: ['PROVIDER_API_KEY'],
      credentialBrokering: ({ env, sandboxEnv }) => {
        if (sandboxEnv?.PROVIDER_API_KEY == null) return [];
        return [
          {
            match: {
              host: 'provider.example',
              headers: [
                {
                  key: { exact: 'Authorization' },
                  value: {
                    exact: `Bearer ${sandboxEnv.PROVIDER_API_KEY}`,
                  },
                },
              ],
            },
            transform: {
              headers: { Authorization: `Bearer ${env.PROVIDER_API_KEY}` },
            },
          },
        ];
      },
    });

    await expect(
      harness.doStart({
        sessionId: 'session-1',
        sandboxSession: fakeSandbox({
          runs: [],
          spawns,
          stop: async () => {},
          addRequestTransformations: async () => {
            throw error;
          },
        }),
        sessionWorkDir: '/workspace/user-project',
      }),
    ).rejects.toBe(error);
    expect(spawns).toEqual([]);
    expect(harnessUtilsMocks.channels).toEqual([]);
  });

  it('forwards MCP servers and lets the implementation classify unknown ACP tools', async () => {
    const isMcpToolCall = vi.fn(
      (toolCall: { _meta?: Record<string, unknown> | null }) =>
        toolCall._meta?.is_mcp_tool_call === true,
    );
    const mcpServers = {
      external: {
        command: '/usr/bin/external-mcp',
        args: [],
        env: [],
      },
    };
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      mcpServers,
      isMcpToolCall,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const events: unknown[] = [];
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Use the external tool.',
      emit: event => events.push(event),
    });
    const channel = harnessUtilsMocks.channels[0]!;

    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      mcpServers,
    });
    channel.emit({
      type: 'acp-tool-call-candidate',
      requestId: 'candidate-1',
      toolCall: {
        toolCallId: 'call-1',
        title: 'External tool',
        _meta: { is_mcp_tool_call: true },
      },
    });
    channel.emit({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'external_tool',
      input: '{}',
      providerExecuted: true,
    });
    channel.emit({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'external_tool',
      result: { ok: true },
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });

    await control.done;
    expect(isMcpToolCall).toHaveBeenCalledOnce();
    expect(events).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "input": "{}",
          "providerExecuted": true,
          "toolCallId": "call-1",
          "toolName": "external_tool",
          "type": "tool-call",
        },
        {
          "dynamic": true,
          "result": {
            "ok": true,
          },
          "toolCallId": "call-1",
          "toolName": "external_tool",
          "type": "tool-result",
        },
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "totalUsage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
          },
          "type": "finish",
        },
      ]
    `);
    await session.doDestroy();
  });

  it('reserves the host-tool MCP server name', () => {
    expect(() =>
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        mcpServers: { 'ai-sdk-harness-tools': {} },
      }),
    ).toThrow('reserved for HarnessAgent tools');
  });

  it('advertises approvals with and without a complete mapping', () => {
    const mapped = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      permissionModeMapping,
    });
    const incomplete = createACP({
      harnessId: 'codex-acp-incomplete',
      ...agentSettings,
      permissionModeMapping: {
        'allow-all': permissionModeMapping['allow-all'],
      } as never,
    });

    expect(mapped.supportsBuiltinToolApprovals).toBe(true);
    expect(mapped.supportsBuiltinToolFiltering).toBe(false);
    expect(incomplete.supportsBuiltinToolApprovals).toBe(true);
    expect(incomplete.supportsBuiltinToolFiltering).toBe(false);
  });

  it('supports restrictive permission modes without a mapping', async () => {
    const harness = createACP({
      harnessId: 'grok-build-acp',
      ...agentSettings,
    });

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
      permissionMode: 'allow-reads',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Check permissions.',
      emit: () => {},
    });
    const channel = harnessUtilsMocks.channels[0]!;

    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      permissionMode: 'allow-reads',
    });
    expect(channel.sent[0]).toHaveProperty('permissionModeMapping', undefined);
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await control.done;
    await session.doDestroy();
  });

  it('transports explicit unsupported permission mode mappings', async () => {
    const unsupportedMapping = {
      'allow-reads': null,
      'allow-edits': null,
      'allow-all': {
        type: 'session-mode',
        modeId: 'agent-full-access',
      },
    } as const satisfies ACPPermissionModeMapping;
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      permissionModeMapping: unsupportedMapping,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
      permissionMode: 'allow-all',
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Check permissions.',
      emit: () => {},
    });
    const channel = harnessUtilsMocks.channels[0]!;

    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      permissionModeMapping: unsupportedMapping,
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await control.done;
    await session.doDestroy();
  });

  it('does not claim native filtering when approval mapping is complete', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      permissionModeMapping,
    });

    await expect(
      harness.doStart({
        sessionId: 'session-1',
        sandboxSession: fakeSandbox({
          runs: [],
          spawns: [],
          stop: async () => {},
        }),
        sessionWorkDir: '/workspace/user-project',
        builtinToolFiltering: { mode: 'deny', toolNames: ['bash'] },
      }),
    ).rejects.toThrow('built-in tool filtering is not available');
    expect(harnessUtilsMocks.channels).toHaveLength(0);
  });

  it('rejects unsupported versions clearly', () => {
    expect(() =>
      createACP({
        version: 'v2',
        harnessId: 'codex-acp',
        ...agentSettings,
      } as never),
    ).toThrow('Unsupported ACP protocol version "v2"');
  });

  it.each(['CodexACP', 'codex_acp', 'codex/acp', 'codex--acp', ''])(
    'rejects unstable harness id %j',
    harnessId => {
      expect(() => createACP({ harnessId, ...agentSettings })).toThrow(
        'stable kebab-case identifier',
      );
    },
  );

  it('preserves supplied built-in definitions', () => {
    const builtinTools = {
      bash: commonTool('bash', {
        nativeName: 'shell',
        inputSchema: z.object({ command: z.string() }),
      }),
    };
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      builtinTools,
    });

    expect(harness.builtinTools).toBe(builtinTools);
    expect(harness.builtinTools.bash.nativeName).toBe('shell');
  });

  it('serializes built-in matching fields and input schemas across the bridge', () => {
    const builtinTools = {
      bash: {
        ...commonTool('bash', {
          nativeName: 'shell',
          toolUseKind: 'bash',
          description: 'Execute a command',
          inputSchema: z.object({ command: z.string() }),
        }),
        title: 'Terminal',
      },
    };

    expect(serializeBuiltinTools({ builtinTools })).toMatchInlineSnapshot(`
      [
        {
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "command": {
                "type": "string",
              },
            },
            "required": [
              "command",
            ],
            "type": "object",
          },
          "nativeName": "shell",
          "title": "Terminal",
          "toolName": "bash",
          "toolUseKind": "bash",
        },
      ]
    `);
    expect(
      JSON.stringify(serializeBuiltinTools({ builtinTools })),
    ).not.toContain('Execute a command');
  });

  it('requires an exact npm package version', () => {
    expect(() =>
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        source: { ...agentSettings.source, packageVersion: '^1.1.4' },
      }),
    ).toThrow('exact semantic version');
  });

  it('resolves the latest dist-tag when no package version is pinned', async () => {
    const harness = createACP({
      harnessId: 'codex-acp-unpinned',
      ...agentSettings,
      source: {
        type: 'npm-simple',
        packageName: '@agentclientprotocol/codex-acp',
      },
    });
    const bootstrap = await harness.getBootstrap!();

    expect(
      bootstrap.files.find(file =>
        file.path.endsWith('/implementation/package.json'),
      )?.content,
    ).toContain('"@agentclientprotocol/codex-acp": "latest"');
    expect(bootstrap.commands.map(command => command.command)).toEqual([
      'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      'pnpm --dir implementation install --prod --store-dir ../.pnpm-store',
    ]);
  });

  it('generates implementation acquisition files and caches the bootstrap', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const first = await harness.getBootstrap!();
    const second = await harness.getBootstrap!();

    expect(second).toBe(first);
    expect(first.harnessId).toBe('codex-acp');
    expect(first.bootstrapDir).toBe('.harness-bootstrap/codex-acp');
    expect(first.files.map(file => file.path).sort()).toEqual([
      '.harness-bootstrap/codex-acp/bridge.mjs',
      '.harness-bootstrap/codex-acp/host-tool-mcp.mjs',
      '.harness-bootstrap/codex-acp/implementation/implementation.json',
      '.harness-bootstrap/codex-acp/implementation/package.json',
      '.harness-bootstrap/codex-acp/package.json',
      '.harness-bootstrap/codex-acp/pnpm-lock.yaml',
    ]);
    expect(
      first.files.find(file => file.path.endsWith('/package.json'))?.content,
    ).toContain('@ai-sdk/harness-acp-bridge');
    expect(
      first.files.find(file =>
        file.path.endsWith('/implementation/package.json'),
      )?.content,
    ).toContain('"@agentclientprotocol/codex-acp": "1.1.4"');
    expect(
      first.files.find(file =>
        file.path.endsWith('/implementation/implementation.json'),
      )?.content,
    ).toContain('"executablePath": "node_modules/.bin/codex-acp"');
    expect(first.commands.map(command => command.command)).toEqual([
      'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      'pnpm --dir implementation install --prod --store-dir ../.pnpm-store',
    ]);
    expect(
      first.files.every(file =>
        file.path.startsWith('.harness-bootstrap/codex-acp/'),
      ),
    ).toBe(true);
    expect(
      first.files.some(file => file.path.startsWith('/workspace/user-project')),
    ).toBe(false);
  });

  it('caches bootstrap per factory without sharing configuration globally', async () => {
    const firstHarness = createACP({
      harnessId: 'first-acp',
      ...agentSettings,
    });
    const secondHarness = createACP({
      harnessId: 'second-acp',
      ...agentSettings,
    });
    const firstBootstrap = await firstHarness.getBootstrap!();
    const secondBootstrap = await secondHarness.getBootstrap!();

    expect(await firstHarness.getBootstrap!()).toBe(firstBootstrap);
    expect(await secondHarness.getBootstrap!()).toBe(secondBootstrap);
    expect(firstBootstrap).not.toBe(secondBootstrap);
    expect(firstBootstrap.bootstrapDir).toBe('.harness-bootstrap/first-acp');
    expect(secondBootstrap.bootstrapDir).toBe('.harness-bootstrap/second-acp');
  });

  it('uses caller-provided artifacts for locked frozen acquisition', async () => {
    const pnpmWorkspaceYaml =
      "allowBuilds:\n  '@example/codex-acp@1.2.3': true\n";
    const harness = createACP({
      harnessId: 'codex-acp-locked',
      source: {
        type: 'npm-locked',
        packageJson: lockedPackageJson,
        pnpmLockYaml: lockedPnpmLockYaml,
        pnpmWorkspaceYaml,
      },
      executable: 'codex-acp',
      modelMapping: agentSettings.modelMapping,
    });
    const bootstrap = await harness.getBootstrap!();

    expect(
      bootstrap.files.find(
        file =>
          file.path ===
          '.harness-bootstrap/codex-acp-locked/implementation/package.json',
      )?.content,
    ).toBe(lockedPackageJson);
    expect(
      bootstrap.files.find(
        file =>
          file.path ===
          '.harness-bootstrap/codex-acp-locked/implementation/pnpm-lock.yaml',
      )?.content,
    ).toBe(lockedPnpmLockYaml);
    expect(
      bootstrap.files.find(
        file =>
          file.path ===
          '.harness-bootstrap/codex-acp-locked/implementation/pnpm-workspace.yaml',
      )?.content,
    ).toBe(pnpmWorkspaceYaml);
    expect(bootstrap.commands.map(command => command.command)).toContain(
      'pnpm --dir implementation install --frozen-lockfile --prod --store-dir ../.pnpm-store',
    );
  });

  it('generates isolated install command acquisition without npm implementation files', async () => {
    const harness = createACP({
      harnessId: 'cursor-acp',
      source: {
        type: 'install-command',
        command: 'curl https://cursor.com/install -fsS | bash',
      },
      executable: 'agent',
      args: ['--disable-auto-update', 'acp'],
      modelMapping: agentSettings.modelMapping,
    });
    const bootstrap = await harness.getBootstrap!();
    const implementationFiles = bootstrap.files.filter(file =>
      file.path.includes('/implementation/'),
    );

    expect(implementationFiles.map(file => file.path).sort()).toEqual([
      '.harness-bootstrap/cursor-acp/implementation/implementation.json',
      '.harness-bootstrap/cursor-acp/implementation/install.sh',
    ]);
    expect(
      implementationFiles.find(file => file.path.endsWith('/install.sh'))
        ?.content,
    ).toContain('curl https://cursor.com/install -fsS | bash');
    expect(
      implementationFiles.find(file =>
        file.path.endsWith('/implementation.json'),
      )?.content,
    ).toContain('"executablePath": "home/.local/bin/agent"');
    expect(bootstrap.commands.map(command => command.command)).toEqual([
      'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      'bash implementation/install.sh',
    ]);
  });

  it('uses the supplied sandbox and workdir while separating bridge and direct provider auth', async () => {
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const stop = vi.fn(async () => {});
    const harness = createACP({
      harnessId: 'codex-acp',
      auth: 'direct',
      ...agentSettings,
      authentication: { methodId: 'api-key' },
      providerAuthentication: {
        gateway: {
          env: {},
        },
      },
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({ runs, spawns, stop }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(runs[0]).toBe('printf "%s" "$HOME"');
    expect(runs[1]).toMatch(
      /^mkdir -p '\/workspace\/user-project' '\/home\/agent\/\.ai-sdk\/harness-acp\/codex-acp\/[a-f0-9]{64}\/bridge'$/,
    );
    expect(runs[1]).not.toContain("'/workspace/user-project/.ai-sdk");
    expect(spawns[0].command).toContain("--workdir '/workspace/user-project'");
    expect(spawns[0].command).toContain(
      "node '/workspace/.harness-bootstrap/codex-acp/bridge.mjs'",
    );
    expect(spawns[0].command).toContain(
      "--implementation-dir '/workspace/.harness-bootstrap/codex-acp/implementation'",
    );
    expect(spawns[0].env.CODEX_API_KEY).toBe('test-key');
    expect(spawns[0].env.BRIDGE_CHANNEL_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    expect(spawns[0].env.BRIDGE_CHANNEL_TOKEN).not.toBe('test-key');
    expect(spawns[0].env.AI_SDK_ACP_GATEWAY_API_KEY).toBeUndefined();
    expect(spawns[0].env.AI_SDK_ACP_CLIENT_APP_NAME).toBe('ai-sdk/harness-acp');
    expect(spawns[0].env.AI_SDK_ACP_CLIENT_APP_VERSION).toBe('0.0.0-test');
    expect(stop).not.toHaveBeenCalled();

    await session.doDestroy();
    expect(stop).not.toHaveBeenCalled();
  });

  it('requires explicit bridge settings for a basic sandbox session', async () => {
    const networkSession = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const sandboxSession = networkSession.restricted();

    await expect(
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        portEndpoint: { url: 'ws://127.0.0.1:4319' },
      }).doStart({
        sessionId: 'session-1',
        sandboxSession,
        sessionWorkDir: '/workspace/user-project',
      }),
    ).rejects.toThrow(/explicit `port`/);

    await expect(
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        port: 4319,
      }).doStart({
        sessionId: 'session-1',
        sandboxSession,
        sessionWorkDir: '/workspace/user-project',
      }),
    ).rejects.toThrow(/explicit `portEndpoint`/);
  });

  it('uses a basic sandbox session with explicit bridge settings', async () => {
    const runs: string[] = [];
    const networkSession = fakeSandbox({
      runs,
      spawns: [],
      stop: async () => {},
    });
    const session = await createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      port: 4319,
      portEndpoint: { url: 'ws://127.0.0.1:4319' },
    }).doStart({
      sessionId: 'session-1',
      sandboxSession: networkSession.restricted(),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(runs[0]).toBe('pwd');
    const resumeFrom = await session.doDetach();
    expect(resumeFrom.data).toMatchObject({
      bridge: {
        port: 4319,
        token: expect.any(String),
        lastSeenEventId: 0,
      },
    });
    expect(resumeFrom.data).not.toMatchObject({
      bridge: { sandboxId: expect.anything() },
    });
  });

  it('requires a sandbox id for custom bridge token minting', async () => {
    const networkSession = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });

    await expect(
      createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        port: 4319,
        portEndpoint: { url: 'ws://127.0.0.1:4319' },
        mintBridgeToken: sandboxId => sandboxId,
      }).doStart({
        sessionId: 'session-1',
        sandboxSession: networkSession.restricted(),
        sessionWorkDir: '/workspace/user-project',
      }),
    ).rejects.toThrow(/does not expose an id/);
  });

  it('reuses a caller-minted token and passes endpoint headers when attaching', async () => {
    harnessUtilsMocks.connectOnOpen = true;
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const mintBridgeToken = vi.fn(
      (sandboxId: string) => `token-for-${sandboxId}`,
    );
    const portEndpoint = {
      url: 'wss://sandbox.example/bridge?existing=value',
      headers: { 'E2B-Traffic-Access-Token': 'traffic-token' },
    };
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      mintBridgeToken,
      portEndpoint,
    });
    const sandboxSession = fakeSandbox({
      runs: [],
      spawns,
      stop: async () => {},
      bridgePortEndpoint: { url: 'ws://unused.example' },
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession,
      sessionWorkDir: '/workspace/user-project',
    });

    expect(mintBridgeToken).toHaveBeenCalledExactlyOnceWith('sandbox-1');
    expect(spawns[0].env.BRIDGE_CHANNEL_TOKEN).toBe('token-for-sandbox-1');

    const resumeFrom = await session.doDetach();
    expect(resumeFrom.data).toMatchObject({
      bridge: { token: 'token-for-sandbox-1' },
    });

    const attachedSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom,
    });
    expect(mintBridgeToken).toHaveBeenCalledTimes(1);
    expect(webSocketMocks.calls).toEqual([
      {
        url: 'wss://sandbox.example/bridge?existing=value&agent_bridge_token=token-for-sandbox-1',
        headers: portEndpoint.headers,
      },
      {
        url: 'wss://sandbox.example/bridge?existing=value&agent_bridge_token=token-for-sandbox-1',
        headers: portEndpoint.headers,
      },
    ]);
    await attachedSession.doDetach();
  });

  it('rejects an already-aborted turn without sending a start frame', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const abortController = new AbortController();
    const abortError = new Error('cancel before start');
    abortController.abort(abortError);

    await expect(
      session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Do not start',
        abortSignal: abortController.signal,
        emit: () => {},
      }),
    ).rejects.toBe(abortError);
    expect(harnessUtilsMocks.channels[0]!.sent).toEqual([]);

    await session.doDestroy();
  });

  it('rejects structured output when the ACP profile has no schema mapping', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    await expect(
      session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Answer.',
        responseFormat: {
          type: 'json',
          schema: { type: 'object' },
        },
        emit: () => {},
      }),
    ).rejects.toSatisfy(error =>
      HarnessCapabilityUnsupportedError.isInstance(error),
    );
    expect(harnessUtilsMocks.channels[0]!.sent).toEqual([]);

    await session.doDestroy();
  });

  it('passes structured output configuration to a mapped ACP profile', async () => {
    const outputSchemaMapping = {
      type: 'session-prompt-meta',
      path: ['outputSchema'],
    } as const;
    const harness = createACP({
      harnessId: 'grok-build-acp',
      ...agentSettings,
      outputSchemaMapping,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const responseFormat = {
      type: 'json' as const,
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    };

    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Answer.',
      responseFormat,
      emit: () => {},
    });
    const channel = harnessUtilsMocks.channels[0]!;
    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      responseFormat,
      outputSchemaMapping,
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await control.done;
    await session.doDestroy();
  });

  it('materializes skills in the native directory without adding them to prompt guidance', async () => {
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const skills = [
      {
        name: 'release-notes',
        description: 'Prepare concise release notes.',
        content: 'Full private skill instructions.',
        files: [
          {
            path: 'references/style.md',
            content: 'Use active voice.',
          },
        ],
      },
    ];
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs,
        spawns,
        writes,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;

    const first = await session.doPromptTurn({
      skills,
      tools: [],
      prompt: {
        role: 'user',
        content: [
          { type: 'text', text: 'Draft' },
          { type: 'text', text: 'the notes.' },
        ],
      },
      instructions: 'Use the supplied project context.',
      emit: () => {},
    });
    const skillDefinition = writes.find(write =>
      write.path.endsWith('/release-notes/SKILL.md'),
    );
    expect(skillDefinition).toBeDefined();
    expect(skillDefinition?.path).toBe(
      '/home/agent/.agents/skills/release-notes/SKILL.md',
    );
    expect(skillDefinition?.path.startsWith('/workspace/user-project')).toBe(
      false,
    );
    expect(skillDefinition?.content).toContain(
      'Full private skill instructions.',
    );
    expect(writes).toContainEqual({
      path: skillDefinition?.path.replace(
        /\/SKILL\.md$/,
        '/references/style.md',
      ),
      content: 'Use active voice.',
    });
    expect(runs).toContain('printf "%s" "$HOME"');
    const firstStart = channel.sent[0] as {
      prompt: Array<{ type: 'text'; text: string }>;
    };
    expect(firstStart.prompt.slice(1)).toEqual([
      { type: 'text', text: 'Draft' },
      { type: 'text', text: 'the notes.' },
    ]);
    expect(firstStart.prompt[0]?.text).toContain('<session-guidance>');
    expect(firstStart.prompt[0]?.text).toContain(
      'Use the supplied project context.',
    );
    expect(JSON.stringify(firstStart.prompt)).not.toContain('release-notes');
    expect(JSON.stringify(firstStart.prompt)).not.toContain(
      skillDefinition?.path ?? 'missing skill path',
    );
    expect(JSON.stringify(firstStart.prompt)).not.toContain(
      'Full private skill instructions.',
    );
    expect(JSON.stringify(firstStart.prompt)).not.toContain(
      'Use active voice.',
    );
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await first.done;

    const second = await session.doPromptTurn({
      skills,
      tools: [],
      prompt: 'Revise them.',
      instructions: 'Use the revised project context.',
      emit: () => {},
    });
    expect(channel.sent[1]).toMatchObject({ type: 'start' });
    const secondStart = channel.sent[1] as {
      prompt: Array<{ type: 'text'; text: string }>;
    };
    expect(secondStart.prompt.slice(1)).toEqual([
      { type: 'text', text: 'Revise them.' },
    ]);
    expect(secondStart.prompt[0]?.text).toContain('<session-guidance>');
    expect(secondStart.prompt[0]?.text).toContain(
      'Use the revised project context.',
    );
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await second.done;

    const lifecycleState = await session.doStop();
    expect(lifecycleState.data).toMatchObject({
      implementationIdentity: expect.any(String),
      authenticationProfile: {
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        providerKind: 'direct',
      },
      initialGuidanceApplied: true,
      skillsDirectory: '/home/agent/.agents/skills',
    });
    expect(lifecycleState.data).not.toHaveProperty('skillsFingerprint');
    expect(lifecycleState.data).not.toHaveProperty('skillsMaterialized');
  });

  it('materializes install-command skills relative to the private implementation home', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createACP({
      harnessId: 'cursor-skills-acp',
      source: {
        type: 'install-command',
        command: 'curl https://cursor.com/install -fsS | bash',
      },
      executable: 'agent',
      args: ['--disable-auto-update', 'acp'],
      modelMapping: agentSettings.modelMapping,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        writes,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const control = await session.doPromptTurn({
      skills: [
        {
          name: 'release-notes',
          description: 'Prepare release notes.',
          content: 'Use active voice.',
        },
      ],
      tools: [],
      prompt: 'Draft release notes.',
      emit: () => {},
    });

    expect(writes).toContainEqual({
      path: '/workspace/.harness-bootstrap/cursor-skills-acp/implementation/home/.agents/skills/release-notes/SKILL.md',
      content:
        '---\n' +
        'name: release-notes\n' +
        'description: Prepare release notes.\n' +
        '---\n\n' +
        'Use active voice.',
    });
    harnessUtilsMocks.channels[0]!.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await control.done;
    await session.doDestroy();
  });

  it('uses native instructions initially and prompt guidance when they change', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createACP({
      harnessId: 'claude-acp',
      ...agentSettings,
      skillsDirectory: '.claude/skills',
      instructionMapping: {
        type: 'session-meta',
        path: ['systemPrompt', 'append'],
      },
    });
    const skills = [
      {
        name: 'release-notes',
        description: 'Prepare concise release notes.',
        content: 'Use active voice.',
      },
    ];
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        writes,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;

    const first = await session.doPromptTurn({
      skills,
      tools: [],
      prompt: 'Draft release notes.',
      instructions: 'Answer every question in German.',
      emit: () => {},
    });
    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      instructions: 'Answer every question in German.',
      instructionMapping: {
        type: 'session-meta',
        path: ['systemPrompt', 'append'],
      },
      prompt: [{ type: 'text', text: 'Draft release notes.' }],
    });
    expect(writes).toContainEqual({
      path: '/home/agent/.claude/skills/release-notes/SKILL.md',
      content:
        '---\n' +
        'name: release-notes\n' +
        'description: Prepare concise release notes.\n' +
        '---\n\n' +
        'Use active voice.',
    });
    expect(
      JSON.stringify(Reflect.get(channel.sent[0]!, 'prompt')),
    ).not.toContain('Answer every question in German.');
    expect(
      JSON.stringify(Reflect.get(channel.sent[0]!, 'prompt')),
    ).not.toContain('release-notes');
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await first.done;

    const second = await session.doPromptTurn({
      skills,
      tools: [],
      prompt: 'Revise them.',
      instructions: 'Answer every question in French.',
      emit: () => {},
    });
    expect(channel.sent[1]).toMatchObject({
      type: 'start',
      instructions: 'Answer every question in French.',
      instructionMapping: {
        type: 'session-meta',
        path: ['systemPrompt', 'append'],
      },
    });
    const secondStart = channel.sent[1] as {
      prompt: Array<{ type: 'text'; text: string }>;
    };
    expect(secondStart.prompt.slice(1)).toEqual([
      { type: 'text', text: 'Revise them.' },
    ]);
    expect(secondStart.prompt[0]?.text).toContain(
      'Answer every question in French.',
    );
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await second.done;
    await session.doDestroy();
  });

  it('replaces changed skills before starting the next turn', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs,
        spawns: [],
        writes,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const first = await session.doPromptTurn({
      skills: [
        {
          name: 'review-workflow',
          description: 'Review changes.',
          content: 'Review the implementation.',
        },
      ],
      tools: [],
      prompt: 'Review this change.',
      emit: () => {},
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await first.done;

    const second = await session.doPromptTurn({
      skills: [
        {
          name: 'release-workflow',
          description: 'Prepare releases.',
          content: 'Draft the release notes.',
        },
      ],
      tools: [],
      prompt: 'Prepare the release.',
      emit: () => {},
    });
    expect(runs).toContain(
      "rm -rf -- '/home/agent/.agents/skills/review-workflow'",
    );
    expect(
      writes.some(write => write.path.endsWith('/release-workflow/SKILL.md')),
    ).toBe(true);
    expect(channel.sent[1]).toMatchObject({
      type: 'start',
      prompt: [{ type: 'text', text: 'Prepare the release.' }],
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await second.done;
    await session.doDestroy();
  });

  it('detaches between turns and attaches without spawning or reapplying guidance and skills', async () => {
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const writes: Array<{ path: string; content: string }> = [];
    const sandbox = fakeSandbox({
      runs,
      spawns,
      writes,
      stop: async () => {},
    });
    const skills = [
      {
        name: 'private-context',
        description: 'Use private context.',
        content: 'Private skill body.',
      },
    ] as const;
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      authentication: { methodId: 'api-key' },
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
      skills,
      tools: [],
      prompt: 'Remember the number 42.',
      instructions: 'Remember user-provided facts.',
      emit: () => {},
    });
    firstChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-session-1',
    });
    firstChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await firstTurn.done;

    harnessUtilsMocks.nextSuspensionCursor = 17;
    const resumeFrom = await firstSession.doDetach();
    expect(resumeFrom.data).toMatchObject({
      implementationIdentity: expect.any(String),
      authenticationProfile: {
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        acpMethodId: 'api-key',
        providerKind: 'direct',
      },
      acpSessionId: 'acp-session-1',
      bridge: {
        port: 4319,
        token: expect.stringMatching(/^[a-f0-9]{64}$/),
        lastSeenEventId: 17,
        sandboxId: 'sandbox-1',
      },
      initialGuidanceApplied: true,
      skillsDirectory: '/home/agent/.agents/skills',
    });
    expect(JSON.stringify(resumeFrom)).not.toContain('test-key');
    const writeCount = writes.length;

    const secondSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom,
    });
    const secondChannel = harnessUtilsMocks.channels[1]!;
    expect(secondSession.isResume).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(writes).toHaveLength(writeCount);
    expect(secondChannel.options.initialLastSeenEventId).toBe(17);
    expect(secondChannel.openOptions).toBeUndefined();

    const secondTurn = await secondSession.doPromptTurn({
      skills,
      tools: [],
      prompt: 'What number did I ask you to remember?',
      instructions: 'Remember user-provided facts.',
      emit: () => {},
    });
    expect(secondChannel.sent[0]).toMatchObject({
      type: 'start',
      prompt: [
        {
          type: 'text',
          text: 'What number did I ask you to remember?',
        },
      ],
    });
    expect(JSON.stringify(secondChannel.sent[0])).not.toContain(
      '<session-guidance>',
    );
    expect(JSON.stringify(secondChannel.sent[0])).not.toContain(
      'Private skill body.',
    );
    secondChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await secondTurn.done;
    await secondSession.doDestroy();
  });

  it('persists prompt-free cold state and restores with fresh Gateway credentials before the next turn', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-before-stop');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example/custom');
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const writes: Array<{ path: string; content: string }> = [];
    const stop = vi.fn(async () => {});
    const sandbox = fakeSandbox({
      runs,
      spawns,
      writes,
      stop,
    });
    const harness = createACP({
      harnessId: 'cold-gateway-acp',
      auth: 'ai-gateway',
      ...agentSettings,
      forwardEnv: [],
      modelId: 'gpt-5.1-codex',
      session: {
        meta: {
          profile: 'restored',
        },
      },
      permissionModeMapping,
      providerAuthentication: {
        gateway: {
          env: {},
        },
      },
    });
    const skills = [
      {
        name: 'cold-context',
        description: 'Preserve cold context.',
        content: 'Use the restored context.',
      },
    ] as const;
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      permissionMode: 'allow-edits',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
      skills,
      prompt: 'Remember the private phrase cedar-lantern.',
      instructions: 'Retain facts across native session restoration.',
      tools: [
        {
          name: 'firstTool',
          description: 'The first-turn tool.',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
          },
        },
      ],
      emit: () => {},
    });
    firstChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-session-1',
    });
    firstChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await firstTurn.done;

    const stopped = await firstSession.doStop();
    const serializedStopped = JSON.stringify(stopped);
    expect(stopped.data).toMatchObject({
      acpSessionId: 'acp-session-1',
      coldSession: {
        version: 1,
        permissionMode: 'allow-edits',
        tools: [
          expect.objectContaining({
            name: 'firstTool',
          }),
        ],
      },
      initialGuidanceApplied: true,
      skillsDirectory: '/home/agent/.agents/skills',
    });
    expect(stopped.data).not.toHaveProperty('bridge');
    expect(stopped.data).not.toHaveProperty('turnStartConfig');
    expect(serializedStopped).not.toContain(
      'Remember the private phrase cedar-lantern.',
    );
    expect(serializedStopped).not.toContain('gateway-key-before-stop');
    expect(serializedStopped).not.toContain('clientApp');
    expect(firstChannel.sent.at(-1)).toEqual({ type: 'stop' });
    expect(stop).not.toHaveBeenCalled();
    const writeCount = writes.length;

    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-after-stop');
    const resumedPromise = harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom: stopped,
      permissionMode: 'allow-edits',
    });
    await vi.waitFor(() => {
      expect(harnessUtilsMocks.channels).toHaveLength(2);
      expect(harnessUtilsMocks.channels[1]?.sent).toHaveLength(1);
    });
    const resumedChannel = harnessUtilsMocks.channels[1]!;
    const restoreFrame = resumedChannel.sent[0];
    expect(restoreFrame).toMatchObject({
      type: 'start',
      prompt: [],
      permissionMode: 'allow-edits',
      tools: [
        expect.objectContaining({
          name: 'firstTool',
        }),
      ],
      turnStartConfig: {
        prompt: [],
      },
      recoveryMode: {
        type: 'cold-restore',
        acpSessionId: 'acp-session-1',
      },
    });
    expect(JSON.stringify(restoreFrame)).not.toContain(
      'gateway-key-before-stop',
    );
    expect(JSON.stringify(restoreFrame)).not.toContain('clientApp');
    expect(JSON.stringify(restoreFrame)).not.toContain(
      'gateway-key-after-stop',
    );
    expect(restoreFrame).not.toHaveProperty('sessionMeta');
    const bridgeConfiguration = await safeParseJSON({
      text: spawns[1]!.env[ACP_BRIDGE_CONFIGURATION_ENV]!,
    });
    expect(bridgeConfiguration).toMatchObject({
      success: true,
      value: {
        providerAuthentication: {
          type: 'ai-gateway',
          env: {},
        },
        sessionMeta: {
          profile: 'restored',
        },
      },
    });
    expect(spawns[1]?.env.AI_SDK_ACP_GATEWAY_API_KEY).toBe(
      'gateway-key-after-stop',
    );
    expect(spawns[1]?.env.AI_SDK_ACP_GATEWAY_BASE_URL).toBe(
      'https://gateway.example/custom',
    );
    expect(spawns[1]?.env.AI_SDK_ACP_CLIENT_APP_NAME).toBe(
      'ai-sdk/harness-acp',
    );
    expect(spawns[1]?.env.AI_SDK_ACP_CLIENT_APP_VERSION).toBe('0.0.0-test');
    expect(writes).toHaveLength(writeCount);

    emitColdRestoration({
      channel: resumedChannel,
      method: 'resume',
    });
    const resumedSession = await resumedPromise;
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const resumedTurn = await resumedSession.doPromptTurn({
      skills,
      prompt: 'What phrase did I ask you to remember?',
      instructions: 'Retain facts across native session restoration.',
      tools: [
        {
          name: 'secondTool',
          description: 'A legitimate next-turn catalog change.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
      emit: event => events.push(event),
    });
    expect(resumedChannel.sent[1]).toMatchObject({
      type: 'start',
      prompt: [
        {
          type: 'text',
          text: 'What phrase did I ask you to remember?',
        },
      ],
      tools: [
        expect.objectContaining({
          name: 'secondTool',
        }),
      ],
    });
    expect(JSON.stringify(resumedChannel.sent[1])).not.toContain(
      '<session-guidance>',
    );
    resumedChannel.emit({ type: 'text-start', id: 'answer' });
    resumedChannel.emit({
      type: 'text-delta',
      id: 'answer',
      delta: 'cedar-lantern',
    });
    resumedChannel.emit({ type: 'text-end', id: 'answer' });
    resumedChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await resumedTurn.done;
    expect(events.map(event => event.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ]);

    const restopped = await resumedSession.doStop();
    expect(restopped.data).toMatchObject({
      restoration: { method: 'resume' },
      coldSession: {
        tools: [
          expect.objectContaining({
            name: 'secondTool',
          }),
        ],
      },
    });
    expect(JSON.stringify(restopped)).not.toContain('gateway-key-after-stop');
    expect(stop).not.toHaveBeenCalled();
  });

  it('propagates an unsupported cold restore error and terminates the replacement bridge', async () => {
    const kills: string[] = [];
    const stop = vi.fn(async () => {});
    const sandbox = fakeSandbox({
      runs: [],
      spawns: [],
      kills,
      stop,
    });
    const harness = createACP({
      harnessId: 'unsupported-cold-acp',
      ...agentSettings,
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Establish a native session.',
      emit: () => {},
    });
    firstChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-session-1',
    });
    firstChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await firstTurn.done;
    const resumeFrom = await firstSession.doStop();

    const resumedPromise = harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom,
    });
    await vi.waitFor(() => {
      expect(harnessUtilsMocks.channels).toHaveLength(2);
      expect(harnessUtilsMocks.channels[1]?.sent).toHaveLength(1);
    });
    const replacementChannel = harnessUtilsMocks.channels[1]!;
    replacementChannel.emit({
      type: 'error',
      error: {
        name: 'AI_HarnessBridgeCapabilityUnsupportedError',
        message:
          'Cold ACP session restoration requires the agent to advertise sessionCapabilities.resume or loadSession; a fresh unrelated ACP session will not be created.',
      },
    });

    await expect(resumedPromise).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
    expect(replacementChannel.sent).toEqual([
      expect.objectContaining({
        type: 'start',
        recoveryMode: {
          type: 'cold-restore',
          acpSessionId: 'acp-session-1',
        },
      }),
      { type: 'destroy' },
    ]);
    expect(kills).toHaveLength(2);
    expect(stop).not.toHaveBeenCalled();
  });

  it('restores cold lifecycle state independently of the per-turn model', async () => {
    const sandbox = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const firstHarness = createACP({
      harnessId: 'model-identity-acp',
      ...agentSettings,
    });
    const firstSession = await firstHarness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const turn = await firstSession.doPromptTurn({
      model: 'model-before-stop',
      skills: [],
      tools: [],
      prompt: 'Establish model-scoped state.',
      emit: () => {},
    });
    channel.emit({
      type: 'bridge-thread',
      threadId: 'acp-session-1',
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await turn.done;
    const resumeFrom = await firstSession.doStop();

    const changedHarness = createACP({
      harnessId: 'model-identity-acp',
      ...agentSettings,
    });
    const resumedPromise = changedHarness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom,
    });
    await vi.waitFor(() => {
      expect(harnessUtilsMocks.channels).toHaveLength(2);
      expect(harnessUtilsMocks.channels[1]?.sent).toHaveLength(1);
    });
    const resumedChannel = harnessUtilsMocks.channels[1]!;
    emitColdRestoration({ channel: resumedChannel, method: 'resume' });
    const resumedSession = await resumedPromise;
    const resumedTurn = await resumedSession.doPromptTurn({
      model: 'model-after-stop',
      skills: [],
      tools: [],
      prompt: 'Continue model-independent state.',
      emit: () => {},
    });
    expect(resumedChannel.sent[1]).toMatchObject({
      type: 'start',
      model: 'model-after-stop',
      modelMapping: {
        type: 'session-config-option',
        path: 'model',
      },
    });
    resumedChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await resumedTurn.done;
    await resumedSession.doDestroy();
  });

  it('keeps stop and destroy idempotent without stopping the framework sandbox', async () => {
    const stop = vi.fn(async () => {});
    const kills: string[] = [];
    const sandbox = fakeSandbox({
      runs: [],
      spawns: [],
      kills,
      stop,
    });
    const harness = createACP({
      harnessId: 'idempotent-lifecycle-acp',
      ...agentSettings,
    });
    const stoppedSession = await harness.doStart({
      sessionId: 'session-stop',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/stop',
    });
    const stopChannel = harnessUtilsMocks.channels[0]!;
    const stopTurn = await stoppedSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Establish a stoppable session.',
      emit: () => {},
    });
    stopChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-stop',
    });
    stopChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await stopTurn.done;
    const firstStop = await stoppedSession.doStop();
    const secondStop = await stoppedSession.doStop();
    await stoppedSession.doDestroy();
    expect(secondStop).toEqual(firstStop);
    expect(
      stopChannel.sent.filter(message =>
        isMessageType({ message, type: 'stop' }),
      ),
    ).toEqual([{ type: 'stop' }]);

    const destroyedSession = await harness.doStart({
      sessionId: 'session-destroy',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/destroy',
    });
    const destroyChannel = harnessUtilsMocks.channels[1]!;
    const destroyTurn = await destroyedSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Establish a destroyable session.',
      emit: () => {},
    });
    destroyChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-destroy',
    });
    destroyChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await destroyTurn.done;
    await destroyedSession.doDestroy();
    await destroyedSession.doDestroy();
    expect(
      destroyChannel.sent.filter(message =>
        isMessageType({ message, type: 'destroy' }),
      ),
    ).toEqual([{ type: 'destroy' }]);
    expect(kills).toHaveLength(2);
    expect(stop).not.toHaveBeenCalled();
  });

  it('rejects standard ACP v1 manual compaction without sending a command', async () => {
    const harness = createACP({
      harnessId: 'compact-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;

    await expect(session.doCompact()).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
    await expect(session.doCompact()).rejects.toThrow(
      'ACP v1 does not define manual session compaction',
    );
    expect(channel.sent).toEqual([]);
    await session.doDestroy();
  });

  it('suspends at an exact cursor and resumes a nested continuation by replay only', async () => {
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const sandbox = fakeSandbox({
      runs: [],
      spawns,
      stop: async () => {},
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const delivered: string[] = [];
    const firstTurn = await firstSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Work for a while.',
      emit: event => delivered.push(event.type),
    });
    firstChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-session-1',
    });
    firstChannel.emit({ type: 'stream-start' });
    firstChannel.emit({ type: 'text-start', id: 'text-1' });
    firstChannel.emit({ type: 'text-delta', id: 'text-1', delta: 'before' });

    harnessUtilsMocks.nextSuspensionCursor = 23;
    const continueFrom = await firstSession.doSuspendTurn();
    await firstTurn.done;
    expect(delivered).toEqual(['stream-start', 'text-start', 'text-delta']);
    expect(continueFrom.data).toMatchObject({
      acpSessionId: 'acp-session-1',
      bridge: {
        lastSeenEventId: 23,
      },
      initialGuidanceApplied: true,
    });

    const resumedSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'codex-acp',
        specificationVersion: 'harness-v1',
        data: continueFrom.data,
        continueFrom,
      },
    });
    const resumedChannel = harnessUtilsMocks.channels[1]!;
    expect(resumedSession.isResume).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(resumedChannel.options.initialLastSeenEventId).toBe(23);
    expect(resumedChannel.openOptions).toEqual({ resume: true });

    const replayed: string[] = [];
    const continued = await resumedSession.doContinueTurn({
      skills: [],
      tools: [],
      emit: event => replayed.push(event.type),
    });
    expect(resumedChannel.sent).toEqual([]);
    resumedChannel.emit({
      type: 'text-delta',
      id: 'text-1',
      delta: ' after',
    });
    resumedChannel.emit({ type: 'text-end', id: 'text-1' });
    resumedChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await continued.done;
    expect(replayed).toEqual(['text-delta', 'text-end', 'finish']);
    await resumedSession.doDestroy();
  });

  it('continues a terminal event replayed before the continuation is wired', async () => {
    const sandbox = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Work for a while.',
      emit: () => {},
    });
    firstChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-session-1',
    });

    const continueFrom = await firstSession.doSuspendTurn();
    await firstTurn.done;

    const resumedSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'codex-acp',
        specificationVersion: 'harness-v1',
        data: continueFrom.data,
        continueFrom,
      },
    });
    const resumedChannel = harnessUtilsMocks.channels[1]!;
    resumedChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });

    const replayed: string[] = [];
    const continued = await resumedSession.doContinueTurn({
      skills: [],
      tools: [],
      emit: event => replayed.push(event.type),
    });
    await continued.done;

    expect(replayed).toEqual(['finish']);
    await resumedSession.doDestroy();
  });

  it('respawns a replay-only bridge for a coherent completed disk tail', async () => {
    const files: Record<string, string> = {};
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const sandbox = fakeSandbox({
      runs: [],
      spawns,
      files,
      stop: async () => {},
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const initialSession = await harness.doStart({
      sessionId: 'session-replay',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const initialChannel = harnessUtilsMocks.channels[0]!;
    const initialTurn = await initialSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Complete this while the host is disconnected.',
      emit: () => {},
    });
    initialChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-replay-session',
    });
    harnessUtilsMocks.nextSuspensionCursor = 10;
    const continueFrom = await initialSession.doSuspendTurn();
    await initialTurn.done;
    const stateDir = Reflect.get(
      Reflect.get(continueFrom.data as object, 'bridge'),
      'stateDir',
    ) as string;
    files[`${stateDir}/event-log.ndjson`] =
      `${JSON.stringify({
        type: 'text-delta',
        id: 'text-1',
        delta: 'completed offline',
        seq: 11,
      })}\n` +
      `${JSON.stringify({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        totalUsage: unknownUsage(),
        seq: 12,
      })}\n`;

    harnessUtilsMocks.openErrors.push(new Error('bridge process exited'));
    const recoveredSession = await harness.doStart({
      sessionId: 'session-replay',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      continueFrom,
    });
    const replayChannel = harnessUtilsMocks.channels[2]!;
    expect(spawns).toHaveLength(2);
    expect(spawns[1]!.env.BRIDGE_REPLAY_FROM_DISK).toBe('1');
    expect(replayChannel.options.initialLastSeenEventId).toBe(10);
    expect(replayChannel.openOptions).toEqual({ resume: true });

    const replayed: string[] = [];
    const continued = await recoveredSession.doContinueTurn({
      skills: [],
      tools: [],
      emit: event => replayed.push(event.type),
    });
    expect(replayChannel.sent).toEqual([]);
    replayChannel.emit({
      type: 'text-delta',
      id: 'text-1',
      delta: 'completed offline',
    });
    replayChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await continued.done;
    expect(replayed).toEqual(['text-delta', 'finish']);
    await expect(
      recoveredSession.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Do unrelated work.',
        emit: () => {},
      }),
    ).rejects.toThrow('disk replay only');
    const stopped = await recoveredSession.doStop();
    expect(stopped.data).toMatchObject({
      recovery: {
        mode: 'disk-replay',
        reason: 'completed coherent event log',
      },
    });
  });

  it('reruns an incomplete turn only through session resume with fresh Gateway credentials', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret-before');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example.test/v1');
    const files: Record<string, string> = {};
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const sandbox = fakeSandbox({
      runs: [],
      spawns,
      files,
      stop: async () => {},
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      auth: 'ai-gateway',
      ...agentSettings,
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
      providerAuthentication: {
        gateway: {
          env: {
            AI_GATEWAY_API_KEY: { $source: 'gateway-api-key' },
            AI_GATEWAY_BASE_URL: { $source: 'gateway-base-url' },
            AI_GATEWAY_CLIENT: { $source: 'client-app' },
          },
        },
      },
    });
    const initialSession = await harness.doStart({
      sessionId: 'session-rerun',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const initialChannel = harnessUtilsMocks.channels[0]!;
    const initialTurn = await initialSession.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Finish this durable operation.',
      instructions: 'Keep working until the operation is complete.',
      emit: () => {},
    });
    initialChannel.emit({
      type: 'bridge-thread',
      threadId: 'acp-rerun-session',
    });
    harnessUtilsMocks.nextSuspensionCursor = 20;
    const continueFrom = await initialSession.doSuspendTurn();
    await initialTurn.done;
    expect(JSON.stringify(continueFrom)).not.toContain('gateway-secret-before');
    expect(continueFrom.data).toMatchObject({
      turnStartConfig: {
        prompt: [
          {
            type: 'text',
            text: 'Finish this durable operation.',
          },
        ],
      },
    });
    expect(JSON.stringify(continueFrom)).not.toContain('clientApp');
    const stateDir = Reflect.get(
      Reflect.get(continueFrom.data as object, 'bridge'),
      'stateDir',
    ) as string;
    files[`${stateDir}/event-log.ndjson`] = `${JSON.stringify({
      type: 'text-delta',
      id: 'text-1',
      delta: 'incomplete',
      seq: 21,
    })}\n`;
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret-after');
    harnessUtilsMocks.openErrors.push(new Error('bridge process exited'));
    const recoveredSession = await harness.doStart({
      sessionId: 'session-rerun',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      continueFrom,
    });
    expect(spawns).toHaveLength(2);
    expect(spawns[1]!.env.AI_SDK_ACP_GATEWAY_API_KEY).toBe(
      'gateway-secret-after',
    );
    expect(spawns[1]!.env.BRIDGE_REPLAY_FROM_DISK).toBeUndefined();

    const rerunChannel = harnessUtilsMocks.channels[2]!;
    const continued = await recoveredSession.doContinueTurn({
      skills: [],
      tools: [],
      instructions: 'Keep working until the operation is complete.',
      emit: () => {},
    });
    expect(rerunChannel.sent[0]).toMatchObject({
      type: 'start',
      prompt: [
        {
          type: 'text',
          text: 'Finish this durable operation.',
        },
      ],
      recoveryMode: {
        type: 'lossy-rerun',
        acpSessionId: 'acp-rerun-session',
        reason: 'event log not replayable',
      },
      instructions: 'Keep working until the operation is complete.',
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
    });
    expect(JSON.stringify(rerunChannel.sent[0])).not.toContain(
      'gateway-secret-before',
    );
    expect(JSON.stringify(rerunChannel.sent[0])).not.toContain(
      'gateway-secret-after',
    );
    rerunChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await continued.done;
    harnessUtilsMocks.nextSuspensionCursor = 30;
    const detached = await recoveredSession.doDetach();
    expect(detached.data).toMatchObject({
      recovery: {
        mode: 'lossy-rerun',
        reason: 'event log not replayable',
      },
    });
  });

  it('preserves a pending client tool result across cross-process continuation', async () => {
    const sandboxSession = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const clientTool = tool({
      description: 'Get a value from the client.',
      inputSchema: z.object({ key: z.string() }),
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const firstAgent = new HarnessAgent({
      harness,
      sandbox: sandboxProvider({ session: sandboxSession }),
      tools: { clientTool },
    });
    const firstSession = await firstAgent.createSession({
      sessionId: 'session-1',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const first = await firstAgent.stream({
      session: firstSession,
      prompt: 'Use the client tool.',
    });
    const firstPartsPromise = collectStream({ stream: first.fullStream });
    firstChannel.emit({ type: 'stream-start' });
    firstChannel.emit({
      type: 'tool-call',
      toolCallId: 'client-call',
      toolName: 'clientTool',
      input: JSON.stringify({ key: 'answer' }),
      providerExecuted: false,
    });
    await firstPartsPromise;

    harnessUtilsMocks.nextSuspensionCursor = 31;
    const continueFrom = await firstSession.suspendTurn();
    expect(continueFrom.pendingToolResults).toEqual([
      {
        toolCallId: 'client-call',
        toolName: 'clientTool',
        input: JSON.stringify({ key: 'answer' }),
      },
    ]);

    const secondAgent = new HarnessAgent({
      harness,
      sandbox: sandboxProvider({ session: sandboxSession }),
      tools: { clientTool },
    });
    const secondSession = await secondAgent.createSession({
      sessionId: 'session-1',
      continueFrom,
    });
    const secondChannel = harnessUtilsMocks.channels[1]!;
    const continued = await secondAgent.continueStream({
      session: secondSession,
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: 'client-call',
          toolName: 'clientTool',
          output: { type: 'json', value: { value: 42 } },
        },
      ],
    });
    const continuedPartsPromise = collectStream({
      stream: continued.fullStream,
    });
    await vi.waitFor(() => {
      expect(secondChannel.sent).toContainEqual({
        type: 'tool-result',
        toolCallId: 'client-call',
        output: { value: 42 },
        isError: undefined,
        toolResult: {
          type: 'tool-result',
          toolCallId: 'client-call',
          toolName: 'clientTool',
          output: { type: 'json', value: { value: 42 } },
        },
      });
    });
    secondChannel.emit({
      type: 'tool-result',
      toolCallId: 'client-call',
      toolName: 'clientTool',
      result: { value: 42 },
      providerExecuted: false,
    });
    secondChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await continuedPartsPromise;
    await secondSession.destroy();
  });

  it('preserves a pending native approval across cross-process continuation', async () => {
    const sandboxSession = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      builtinTools: {
        bash: commonTool('bash', {
          nativeName: 'shell',
          toolUseKind: 'bash',
          inputSchema: z.object({ command: z.string() }),
        }),
      },
      permissionModeMapping,
    });
    const firstAgent = new HarnessAgent({
      harness,
      sandbox: sandboxProvider({ session: sandboxSession }),
      permissionMode: 'allow-edits',
    });
    const firstSession = await firstAgent.createSession({
      sessionId: 'session-1',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const first = await firstAgent.stream({
      session: firstSession,
      prompt: 'Run pwd.',
    });
    const firstPartsPromise = collectStream({ stream: first.fullStream });
    firstChannel.emit({ type: 'stream-start' });
    firstChannel.emit({
      type: 'tool-call',
      toolCallId: 'native-call',
      toolName: 'bash',
      input: JSON.stringify({ command: 'pwd' }),
      providerExecuted: true,
    });
    firstChannel.emit({
      type: 'tool-approval-request',
      approvalId: 'native-approval',
      toolCallId: 'native-call',
    });
    await firstPartsPromise;

    harnessUtilsMocks.nextSuspensionCursor = 37;
    const continueFrom = await firstSession.suspendTurn();
    expect(continueFrom.pendingToolApprovals).toEqual([
      {
        approvalId: 'native-approval',
        toolCallId: 'native-call',
        toolName: 'bash',
        input: JSON.stringify({ command: 'pwd' }),
        kind: 'builtin',
        providerExecuted: true,
      },
    ]);

    const secondAgent = new HarnessAgent({
      harness,
      sandbox: sandboxProvider({ session: sandboxSession }),
      permissionMode: 'allow-edits',
    });
    const secondSession = await secondAgent.createSession({
      sessionId: 'session-1',
      continueFrom,
    });
    const secondChannel = harnessUtilsMocks.channels[1]!;
    const continued = await secondAgent.continueStream({
      session: secondSession,
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: 'native-approval',
          approved: true,
        },
      ],
    });
    const continuedPartsPromise = collectStream({
      stream: continued.fullStream,
    });
    await vi.waitFor(() => {
      expect(secondChannel.sent).toContainEqual({
        type: 'tool-approval-response',
        approvalId: 'native-approval',
        approved: true,
        reason: undefined,
      });
    });
    secondChannel.emit({
      type: 'tool-result',
      toolCallId: 'native-call',
      toolName: 'bash',
      result: { output: '/workspace/user-project' },
      providerExecuted: true,
    });
    secondChannel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await continuedPartsPromise;
    await secondSession.destroy();
  });

  it.each([
    { permissionMode: 'allow-reads' },
    { permissionMode: 'allow-edits' },
    { permissionMode: 'allow-all' },
  ] as const)(
    'sends the $permissionMode mapping to the ACP bridge',
    async ({ permissionMode }) => {
      const harness = createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
        permissionModeMapping,
      });
      const session = await harness.doStart({
        sessionId: 'session-1',
        sandboxSession: fakeSandbox({
          runs: [],
          spawns: [],
          stop: async () => {},
        }),
        sessionWorkDir: '/workspace/user-project',
        permissionMode,
      });
      const channel = harnessUtilsMocks.channels[0]!;
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Check permissions.',
        emit: () => {},
      });

      expect(channel.sent[0]).toMatchObject({
        type: 'start',
        permissionMode,
        permissionModeMapping,
      });
      channel.emit({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        totalUsage: unknownUsage(),
      });
      await control.done;
      await session.doDestroy();
    },
  );

  it('submits a host approval decision to the pending ACP turn', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
      permissionModeMapping,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
      permissionMode: 'allow-edits',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const initial = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Run a native command.',
      emit: () => {},
    });
    const continued = await session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });

    await continued.submitToolApproval!({
      approvalId: 'approval-1',
      approved: false,
      reason: 'Not allowed',
    });
    expect(channel.sent.at(-1)).toEqual({
      type: 'tool-approval-response',
      approvalId: 'approval-1',
      approved: false,
      reason: 'Not allowed',
    });

    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await Promise.all([initial.done, continued.done]);
    await session.doDestroy();
  });

  it('sends the exact host tool catalog and submits a continued client result', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const recursiveSchema = {
      type: 'object',
      properties: {
        node: { $ref: '#/$defs/node' },
      },
      $defs: {
        node: {
          type: 'object',
          properties: {
            children: {
              type: 'array',
              items: { $ref: '#/$defs/node' },
            },
          },
        },
      },
    } as const;
    const initial = await session.doPromptTurn({
      skills: [],
      prompt: 'Use the client tool.',
      tools: [
        {
          name: 'client_tree',
          description: 'Inspect a recursive tree.',
          inputSchema: recursiveSchema,
        },
      ],
      emit: () => {},
    });

    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      tools: [
        {
          name: 'client_tree',
          description: 'Inspect a recursive tree.',
          inputSchema: recursiveSchema,
        },
      ],
    });

    const continued = await session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });
    await continued.submitToolResult({
      toolCallId: 'client-call-1',
      output: { accepted: true },
    });
    expect(channel.sent[1]).toEqual({
      type: 'tool-result',
      toolCallId: 'client-call-1',
      output: { accepted: true },
      isError: undefined,
    });

    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: {
        inputTokens: {},
        outputTokens: {},
      },
    });
    await Promise.all([initial.done, continued.done]);
    await session.doDestroy();
  });

  it('sends changed, removed, and unchanged catalogs on consecutive turns', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const finishTurn = () => {
      channel.emit({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        totalUsage: unknownUsage(),
      });
    };

    const first = await session.doPromptTurn({
      skills: [],
      prompt: 'Use weather.',
      tools: [
        {
          name: 'weather',
          description: 'Read weather.',
          inputSchema: { type: 'object' },
        },
      ],
      emit: () => {},
    });
    finishTurn();
    await first.done;

    const second = await session.doPromptTurn({
      skills: [],
      prompt: 'Use time.',
      tools: [
        {
          name: 'time',
          description: 'Read time.',
          inputSchema: { type: 'object' },
        },
      ],
      emit: () => {},
    });
    finishTurn();
    await second.done;

    const third = await session.doPromptTurn({
      skills: [],
      prompt: 'Use time again.',
      tools: [
        {
          name: 'time',
          description: 'Read time.',
          inputSchema: { type: 'object' },
        },
      ],
      emit: () => {},
    });
    finishTurn();
    await third.done;

    expect(
      channel.sent
        .filter(message => isMessageType({ message, type: 'start' }))
        .map(message => Reflect.get(message as object, 'tools')),
    ).toEqual([
      [
        {
          name: 'weather',
          description: 'Read weather.',
          inputSchema: { type: 'object' },
        },
      ],
      [
        {
          name: 'time',
          description: 'Read time.',
          inputSchema: { type: 'object' },
        },
      ],
      [
        {
          name: 'time',
          description: 'Read time.',
          inputSchema: { type: 'object' },
        },
      ],
    ]);

    await session.doDestroy();
  });

  it('preserves capability errors reported by the sandbox bridge', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const turn = await session.doPromptTurn({
      skills: [],
      prompt: 'Use time.',
      tools: [],
      emit: event => events.push(event),
    });

    channel.emit({
      type: 'error',
      error: {
        name: 'AI_HarnessBridgeCapabilityUnsupportedError',
        message: 'The catalog was not refreshed.',
      },
    });

    try {
      await turn.done;
      throw new Error('Expected the turn to fail.');
    } catch (error) {
      expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'AI_HarnessCapabilityUnsupportedError',
        message: 'The catalog was not refreshed.',
        harnessId: 'codex-acp',
      });
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect(HarnessCapabilityUnsupportedError.isInstance(events[0]?.error)).toBe(
      true,
    );
    await session.doDestroy();
  });

  it('executes host tools in the framework and returns only the final generator value', async () => {
    const sandboxSession = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const weather = tool({
      inputSchema: z.object({ city: z.string() }),
      async *execute() {
        yield { state: 'loading' as const };
        yield { state: 'ready' as const, celsius: 19 };
      },
    });
    const agent = new HarnessAgent({
      harness: createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
      }),
      sandbox: sandboxProvider({ session: sandboxSession }),
      tools: { weather },
    });
    const session = await agent.createSession();
    const channel = harnessUtilsMocks.channels[0]!;
    const result = await agent.stream({
      session,
      prompt: 'Use weather for Lima.',
    });
    const partsPromise = collectStream({ stream: result.fullStream });

    channel.emit({ type: 'stream-start' });
    channel.emit({
      type: 'tool-call',
      toolCallId: 'weather-call',
      toolName: 'weather',
      input: JSON.stringify({ city: 'Lima' }),
      providerExecuted: false,
    });
    await vi.waitFor(() => {
      expect(
        channel.sent.filter(message =>
          isMessageType({ message, type: 'tool-result' }),
        ),
      ).toHaveLength(1);
    });
    expect(channel.sent.at(-1)).toEqual({
      type: 'tool-result',
      toolCallId: 'weather-call',
      output: { state: 'ready', celsius: 19 },
      isError: undefined,
    });

    channel.emit({
      type: 'tool-result',
      toolCallId: 'weather-call',
      toolName: 'weather',
      result: { state: 'ready', celsius: 19 },
    });
    channel.emit({
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage: unknownUsage(),
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });

    const parts = await partsPromise;
    expect(parts.filter(isPreliminaryToolResult)).toMatchObject([
      { output: { state: 'loading' }, preliminary: true },
      {
        output: { state: 'ready', celsius: 19 },
        preliminary: true,
      },
    ]);
    expect(await result.toolCalls).toHaveLength(1);
    await session.destroy();
  });

  it('pauses a non-executable tool and continues the same live ACP turn', async () => {
    const sandboxSession = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const clientTool = tool({
      inputSchema: z.object({ question: z.string() }),
    });
    const agent = new HarnessAgent({
      harness: createACP({
        harnessId: 'codex-acp',
        ...agentSettings,
      }),
      sandbox: sandboxProvider({ session: sandboxSession }),
      tools: { clientTool },
    });
    const session = await agent.createSession();
    const channel = harnessUtilsMocks.channels[0]!;
    const first = await agent.stream({
      session,
      prompt: 'Use the client tool.',
    });
    const firstPartsPromise = collectStream({ stream: first.fullStream });
    channel.emit({ type: 'stream-start' });
    channel.emit({
      type: 'tool-call',
      toolCallId: 'client-call',
      toolName: 'clientTool',
      input: JSON.stringify({ question: 'name' }),
      providerExecuted: false,
    });
    await firstPartsPromise;
    expect(session.hasUnfinishedTurn()).toBe(true);

    const continued = await agent.continueStream({
      session,
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: 'client-call',
          toolName: 'clientTool',
          output: { type: 'json', value: { answer: 'Ada' } },
        },
      ],
    });
    const continuedPartsPromise = collectStream({
      stream: continued.fullStream,
    });
    await vi.waitFor(() => {
      expect(channel.sent.at(-1)).toEqual({
        type: 'tool-result',
        toolCallId: 'client-call',
        output: { answer: 'Ada' },
        isError: undefined,
        toolResult: {
          type: 'tool-result',
          toolCallId: 'client-call',
          toolName: 'clientTool',
          output: { type: 'json', value: { answer: 'Ada' } },
        },
      });
    });
    channel.emit({
      type: 'tool-result',
      toolCallId: 'client-call',
      toolName: 'clientTool',
      result: { answer: 'Ada' },
    });
    channel.emit({
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage: unknownUsage(),
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await continuedPartsPromise;

    expect(session.hasUnfinishedTurn()).toBe(false);
    await session.destroy();
  });

  it('waits for the bridge terminal sequence after cancellation before rejecting the turn', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const abortController = new AbortController();
    const abortError = new Error('cancel active turn');
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Start, then cancel',
      abortSignal: abortController.signal,
      emit: event => events.push(event),
    });

    expect(channel.sent).toMatchObject([{ type: 'start' }]);
    abortController.abort(abortError);
    expect(channel.sent).toMatchObject([{ type: 'start' }, { type: 'abort' }]);

    let settled = false;
    void Promise.resolve(control.done)
      .finally(() => {
        settled = true;
      })
      .catch(() => {});
    await Promise.resolve();
    expect(settled).toBe(false);

    const finishReason = { unified: 'other', raw: 'cancelled' } as const;
    const usage = {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
    };
    const doneExpectation = expect(control.done).rejects.toBe(abortError);
    channel.emit({ type: 'text-start', id: 'partial' });
    channel.emit({ type: 'text-end', id: 'partial' });
    channel.emit({
      type: 'finish-step',
      finishReason,
      usage,
      harnessMetadata: { acp: { inferredStep: true } },
    });
    channel.emit({
      type: 'finish',
      finishReason,
      totalUsage: usage,
      harnessMetadata: { acp: { stopReason: 'cancelled' } },
    });

    await doneExpectation;
    expect(events.map(event => event.type)).toEqual([
      'text-start',
      'text-end',
      'finish-step',
      'finish',
    ]);

    await session.doDestroy();
  });

  it('rejects a cancelled turn when the bridge connection fails', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      ...agentSettings,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns: [],
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const abortController = new AbortController();
    const abortError = new Error('cancel before disconnect');
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'Start, then disconnect',
      abortSignal: abortController.signal,
      emit: event => events.push(event),
    });

    abortController.abort(abortError);
    const doneExpectation = expect(control.done).rejects.toBe(abortError);
    channel.emit({ type: 'reasoning-start', id: 'partial' });
    channel.emitClose();
    await doneExpectation;
    expect(events.map(event => event.type)).toEqual([
      'reasoning-start',
      'reasoning-end',
    ]);

    await session.doDestroy();
  });

  it('resolves downstream Gateway credentials separately from bridge auth', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example/custom');
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'codex-acp-gateway',
      auth: 'ai-gateway',
      clientApp: { name: 'custom-client', version: '1.2.3' },
      ...agentSettings,
      forwardEnv: [],
      providerAuthentication: {
        gateway: {
          env: {},
        },
      },
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs,
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(spawns[0].env.AI_SDK_ACP_GATEWAY_API_KEY).toBe('gateway-key');
    expect(spawns[0].env.AI_SDK_ACP_GATEWAY_BASE_URL).toBe(
      'https://gateway.example/custom',
    );
    expect(spawns[0].env.AI_SDK_ACP_CLIENT_APP_NAME).toBe('custom-client');
    expect(spawns[0].env.AI_SDK_ACP_CLIENT_APP_VERSION).toBe('1.2.3');
    expect(spawns[0].env.BRIDGE_CHANNEL_TOKEN).not.toBe('gateway-key');
    expect(spawns[0].env.CODEX_API_KEY).toBeUndefined();

    await session.doDestroy();
  });

  it('resolves automatic provider authentication from the session-start environment', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'late-auth-acp',
      ...agentSettings,
      forwardEnv: [],
      providerAuthentication: {
        gateway: {
          env: {
            PROVIDER_API_KEY: { $source: 'gateway-api-key' },
          },
        },
      },
    });

    vi.stubEnv('AI_GATEWAY_API_KEY', 'late-gateway-key');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example/late');
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(spawns[0]!.env.AI_SDK_ACP_GATEWAY_API_KEY).toBe('late-gateway-key');
    expect(spawns[0]!.env.AI_SDK_ACP_GATEWAY_BASE_URL).toBe(
      'https://gateway.example/late',
    );
    expect(
      await safeParseJSON({
        text: spawns[0]!.env[ACP_BRIDGE_CONFIGURATION_ENV]!,
      }),
    ).toMatchObject({
      success: true,
      value: {
        providerAuthentication: {
          type: 'ai-gateway',
        },
      },
    });
    expect((await session.doStop()).data).toMatchObject({
      authenticationProfile: {
        providerKind: 'ai-gateway',
        providerMode: 'auto',
        gatewayCredentialSource: 'AI_GATEWAY_API_KEY',
      },
    });
  });

  it('excludes resolved credentials from bootstrap and lifecycle state', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example');
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'secret-safe-acp',
      auth: 'ai-gateway',
      ...agentSettings,
      forwardEnv: ['PROVIDER_API_KEY'],
      env: {
        PROVIDER_BASE_URL: 'https://provider.example',
      },
      providerAuthentication: {
        gateway: {
          env: {
            PROVIDER_API_KEY: { $source: 'gateway-api-key' },
          },
        },
      },
    });
    const bootstrap = await harness.getBootstrap!();
    const immutableBootstrap = JSON.stringify(bootstrap);

    expect(immutableBootstrap).not.toContain('direct-secret');
    expect(immutableBootstrap).not.toContain('gateway-secret');
    expect(immutableBootstrap).not.toContain('AI_GATEWAY_API_KEY');

    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs,
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });
    expect(spawns[0].env.PROVIDER_API_KEY).toBe('direct-secret');
    expect(spawns[0].env.PROVIDER_BASE_URL).toBe('https://provider.example');
    expect(spawns[0].env.AI_SDK_ACP_GATEWAY_API_KEY).toBe('gateway-secret');

    const lifecycleState = await session.doStop();
    expect(JSON.stringify(lifecycleState)).not.toContain('direct-secret');
    expect(JSON.stringify(lifecycleState)).not.toContain('gateway-secret');
    expect(lifecycleState.data).toMatchObject({
      implementationIdentity: expect.any(String),
      authenticationProfile: {
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        providerKind: 'ai-gateway',
        providerMode: 'ai-gateway',
        gatewayCredentialSource: 'AI_GATEWAY_API_KEY',
      },
    });
  });

  it('excludes direct provider credentials from its authentication profile', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-profile-secret');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'unused-gateway-secret');
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'direct-secret-safe-acp',
      auth: 'direct',
      ...agentSettings,
      forwardEnv: ['PROVIDER_API_KEY'],
      providerAuthentication: {
        gateway: {
          env: {
            PROVIDER_API_KEY: { $source: 'gateway-api-key' },
          },
        },
      },
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs: [],
        spawns,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
    });

    expect(spawns[0].env.PROVIDER_API_KEY).toBe('direct-profile-secret');
    expect(spawns[0].env.AI_SDK_ACP_GATEWAY_API_KEY).toBeUndefined();

    const lifecycleState = await session.doStop();
    const serialized = JSON.stringify(lifecycleState);
    expect(serialized).not.toContain('direct-profile-secret');
    expect(serialized).not.toContain('unused-gateway-secret');
    expect(lifecycleState.data).toMatchObject({
      implementationIdentity: expect.any(String),
      authenticationProfile: {
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        providerKind: 'direct',
        providerMode: 'direct',
      },
    });
  });

  it('validates lifecycle state structurally and rejects incompatible identities at start', async () => {
    const first = createACP({
      harnessId: 'identity-acp',
      ...agentSettings,
    });
    const second = createACP({
      harnessId: 'identity-acp',
      ...agentSettings,
      args: ['different'],
    });
    const sandbox = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const firstSession = await first.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const resumeFrom = await firstSession.doStop();
    const lifecycleData = resumeFrom.data as Record<string, unknown>;
    const authenticationProfile = lifecycleData.authenticationProfile as Record<
      string,
      unknown
    >;

    const structurallyCompatible = await safeValidateTypes({
      value: lifecycleData,
      schema: second.lifecycleStateSchema!,
    });
    const legacyCompatible = await safeValidateTypes({
      value: {
        ...lifecycleData,
        authenticationProfile: {
          ...authenticationProfile,
          providerKind: 'implementation-default',
        },
      },
      schema: first.lifecycleStateSchema!,
    });
    expect(structurallyCompatible.success).toBe(true);
    expect(legacyCompatible).toMatchObject({
      success: true,
      value: {
        authenticationProfile: {
          providerKind: 'direct',
        },
      },
    });
    await expect(
      second.doStart({
        sessionId: 'session-1',
        sandboxSession: sandbox,
        sessionWorkDir: '/workspace/user-project',
        resumeFrom,
      }),
    ).rejects.toThrow(
      'ACP lifecycle state is incompatible with the configured implementation.',
    );
  });
});
