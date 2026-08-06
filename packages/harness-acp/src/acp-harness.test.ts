import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import { safeParseJSON, safeValidateTypes, tool } from '@ai-sdk/provider-utils';
import * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { createACPAuthenticationProfileIdentity } from './acp-auth';
import { createACP } from './acp-harness';
import {
  resolveBridgeAssetCandidates,
  serializeBuiltinTools,
} from './v1/acp-v1-harness';
import { ACP_BRIDGE_CONFIGURATION_ENV } from './v1/acp-v1-bridge-environment';
import type { ACPPermissionModeMapping } from './v1/acp-v1-settings';

const harnessUtilsMocks = vi.hoisted(() => {
  const channels: FakeSandboxChannel[] = [];
  class FakeSandboxChannel {
    readonly sent: unknown[] = [];
    readonly options: {
      initialLastSeenEventId?: number;
    };
    openOptions: { resume?: boolean } | undefined;
    private readonly listeners = new Map<
      string,
      Set<(event: { type: string; [key: string]: unknown }) => void>
    >();
    private readonly closeHandlers = new Set<
      (code: number, reason: string) => void
    >();
    private closed = false;

    constructor(options: { initialLastSeenEventId?: number }) {
      this.options = options;
      channels.push(this);
    }

    async open(options?: { resume?: boolean }): Promise<void> {
      this.openOptions = options;
      const error = harnessUtilsMocks.openErrors.shift();
      if (error != null) throw error;
    }
    on(
      type: string,
      listener: (event: { type: string; [key: string]: unknown }) => void,
    ): () => void {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
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
      for (const listener of this.listeners.get(event.type) ?? []) {
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

const implementation = {
  type: 'npm',
  mode: 'simple',
  packageName: '@agentclientprotocol/codex-acp',
  version: '1.1.4',
  executable: 'codex-acp',
  args: ['--example'],
  forwardEnv: ['CODEX_API_KEY'],
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
}): HarnessV1NetworkSandboxSession {
  const restricted = {
    readTextFile: async ({ path }: { path: string }) => files[path] ?? null,
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      writes.push({ path, content });
    },
    run: async ({ command }: { command: string }) => {
      runs.push(command);
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: homeDir, stderr: '' };
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
    getPortUrl: async () => 'ws://127.0.0.1:4319',
    stop,
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('constructs the default v1 harness synchronously without reading assets', () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      implementation,
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
        implementation,
      }).specificationVersion,
    ).toBe('harness-v1');
  });

  it('advertises approvals with and without a complete mapping', () => {
    const mapped = createACP({
      harnessId: 'codex-acp',
      implementation,
      permissionModeMapping,
    });
    const incomplete = createACP({
      harnessId: 'codex-acp-incomplete',
      implementation,
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
      implementation,
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

  it('does not claim native filtering when approval mapping is complete', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      implementation,
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
        implementation,
      } as never),
    ).toThrow('Unsupported ACP protocol version "v2"');
  });

  it.each(['CodexACP', 'codex_acp', 'codex/acp', 'codex--acp', ''])(
    'rejects unstable harness id %j',
    harnessId => {
      expect(() => createACP({ harnessId, implementation })).toThrow(
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
      implementation,
      builtinTools,
    });

    expect(harness.builtinTools).toBe(builtinTools);
    expect(harness.builtinTools.bash.nativeName).toBe('shell');
  });

  it('sends only built-in keys and native names across the bridge', () => {
    const builtinTools = {
      bash: commonTool('bash', {
        nativeName: 'shell',
        description: 'Execute a command',
        inputSchema: z.object({ command: z.string() }),
      }),
    };

    expect(serializeBuiltinTools({ builtinTools })).toEqual([
      { toolName: 'bash', nativeName: 'shell' },
    ]);
    expect(
      JSON.stringify(serializeBuiltinTools({ builtinTools })),
    ).not.toContain('Execute a command');
  });

  it('requires an exact npm package version', () => {
    expect(() =>
      createACP({
        harnessId: 'codex-acp',
        implementation: { ...implementation, version: '^1.1.4' },
      }),
    ).toThrow('exact semantic version');
  });

  it('generates implementation acquisition files and caches the bootstrap', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      implementation,
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
    ).toContain('"executable": "codex-acp"');
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
      implementation,
    });
    const secondHarness = createACP({
      harnessId: 'second-acp',
      implementation,
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
    const harness = createACP({
      harnessId: 'codex-acp-locked',
      implementation: {
        type: 'npm',
        mode: 'locked',
        packageJson: lockedPackageJson,
        pnpmLockYaml: lockedPnpmLockYaml,
        executable: 'codex-acp',
      },
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
    expect(bootstrap.commands.map(command => command.command)).toContain(
      'pnpm --dir implementation install --frozen-lockfile --prod --store-dir ../.pnpm-store',
    );
  });

  it('resolves bridge assets from source and bundled module layouts', () => {
    const sourceModuleUrl = new URL('./v1/acp-v1-harness.ts', import.meta.url);
    const bundledModuleUrl = new URL('../dist/index.js', import.meta.url);
    const sourceCandidates = resolveBridgeAssetCandidates({
      name: 'package.json',
      moduleUrl: sourceModuleUrl,
    });
    const bundledCandidates = resolveBridgeAssetCandidates({
      name: 'package.json',
      moduleUrl: bundledModuleUrl,
    });

    expect(sourceCandidates).toContainEqual(
      new URL('./bridge/package.json', import.meta.url),
    );
    expect(bundledCandidates[0]).toEqual(
      new URL('../dist/bridge/package.json', import.meta.url),
    );
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
      implementation,
      authentication: { methodId: 'api-key' },
      providerAuthentication: {
        gateway: {
          route: {
            type: 'auth-method',
            methodId: 'gateway',
          },
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
    expect(spawns[0].env.AI_SDK_ACP_CLIENT_APP_NAME).toBeUndefined();
    expect(spawns[0].env.AI_SDK_ACP_CLIENT_APP_VERSION).toBeUndefined();
    expect(session.modelId).toBeUndefined();
    expect(stop).not.toHaveBeenCalled();

    await session.doDestroy();
    expect(stop).not.toHaveBeenCalled();
  });

  it('rejects an already-aborted turn without sending a start frame', async () => {
    const harness = createACP({
      harnessId: 'codex-acp',
      implementation,
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
        prompt: 'Do not start',
        abortSignal: abortController.signal,
        emit: () => {},
      }),
    ).rejects.toBe(abortError);
    expect(harnessUtilsMocks.channels[0]!.sent).toEqual([]);

    await session.doDestroy();
  });

  it('materializes skills outside the workspace and announces guidance exactly once', async () => {
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createACP({
      harnessId: 'codex-acp',
      implementation,
    });
    const session = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: fakeSandbox({
        runs,
        spawns,
        writes,
        stop: async () => {},
      }),
      sessionWorkDir: '/workspace/user-project',
      skills: [
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
      ],
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const skillDefinition = writes.find(write =>
      write.path.endsWith('/release-notes/SKILL.md'),
    );
    expect(skillDefinition).toBeDefined();
    expect(skillDefinition?.path).toMatch(
      /^\/home\/agent\/\.ai-sdk\/harness-acp\/codex-acp\/[a-f0-9]{64}\/skills\/release-notes\/SKILL\.md$/,
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

    const first = await session.doPromptTurn({
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
    const firstStart = channel.sent[0] as {
      prompt: Array<{ type: 'text'; text: string }>;
      recovery: { providerProfile: { type: string } };
    };
    expect(firstStart.prompt.slice(1)).toEqual([
      { type: 'text', text: 'Draft' },
      { type: 'text', text: 'the notes.' },
    ]);
    expect(firstStart.prompt[0]?.text).toContain('<session-guidance>');
    expect(firstStart.prompt[0]?.text).toContain(
      'Use the supplied project context.',
    );
    expect(firstStart.prompt[0]?.text).toContain(
      skillDefinition?.path ?? 'missing skill path',
    );
    expect(JSON.stringify(firstStart.prompt)).not.toContain(
      'Full private skill instructions.',
    );
    expect(JSON.stringify(firstStart.prompt)).not.toContain(
      'Use active voice.',
    );
    expect(firstStart.recovery.providerProfile).toEqual({ type: 'direct' });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: unknownUsage(),
    });
    await first.done;

    const second = await session.doPromptTurn({
      prompt: 'Revise them.',
      instructions: 'Use the supplied project context.',
      emit: () => {},
    });
    expect(channel.sent[1]).toMatchObject({
      type: 'start',
      prompt: [{ type: 'text', text: 'Revise them.' }],
    });
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
      skillsMaterialized: true,
      skillsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
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
      implementation,
      authentication: { methodId: 'api-key' },
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      skills,
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
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
      skillsMaterialized: true,
      skillsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(resumeFrom)).not.toContain('test-key');
    const writeCount = writes.length;

    const secondSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
      resumeFrom,
      skills,
    });
    const secondChannel = harnessUtilsMocks.channels[1]!;
    expect(secondSession.isResume).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(writes).toHaveLength(writeCount);
    expect(secondChannel.options.initialLastSeenEventId).toBe(17);
    expect(secondChannel.openOptions).toBeUndefined();

    const secondTurn = await secondSession.doPromptTurn({
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
      implementation: {
        ...implementation,
        forwardEnv: [],
      },
      modelId: 'gpt-5.1-codex',
      session: {
        meta: {
          profile: 'restored',
        },
      },
      permissionModeMapping,
      providerAuthentication: {
        gateway: {
          route: {
            type: 'auth-method',
            methodId: 'gateway',
          },
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
      skills,
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
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
        modelId: 'gpt-5.1-codex',
        permissionMode: 'allow-edits',
        providerProfile: {
          type: 'ai-gateway',
          baseUrl: 'https://gateway.example/custom',
          credentialSource: 'AI_GATEWAY_API_KEY',
          routeKind: 'auth-method',
        },
        tools: [
          expect.objectContaining({
            name: 'firstTool',
          }),
        ],
      },
      initialGuidanceApplied: true,
      skillsMaterialized: true,
      skillsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(stopped.data).not.toHaveProperty('bridge');
    expect(stopped.data).not.toHaveProperty('recoveryStart');
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
      skills,
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
      recovery: {
        prompt: [],
        providerProfile: {
          baseUrl: 'https://gateway.example/custom',
        },
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
          route: {
            type: 'auth-method',
            methodId: 'gateway',
          },
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
      implementation,
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const firstTurn = await firstSession.doPromptTurn({
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

  it('rejects cold lifecycle state when the configured model changes', async () => {
    const sandbox = fakeSandbox({
      runs: [],
      spawns: [],
      stop: async () => {},
    });
    const firstHarness = createACP({
      harnessId: 'model-identity-acp',
      implementation,
      modelId: 'model-before-stop',
    });
    const firstSession = await firstHarness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const channel = harnessUtilsMocks.channels[0]!;
    const turn = await firstSession.doPromptTurn({
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
      implementation,
      modelId: 'model-after-stop',
    });
    await expect(
      changedHarness.doStart({
        sessionId: 'session-1',
        sandboxSession: sandbox,
        sessionWorkDir: '/workspace/user-project',
        resumeFrom,
      }),
    ).rejects.toThrow(
      'cold-session state is incompatible with the current non-secret session configuration',
    );
    expect(harnessUtilsMocks.channels).toHaveLength(1);
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
      implementation,
    });
    const stoppedSession = await harness.doStart({
      sessionId: 'session-stop',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/stop',
    });
    const stopChannel = harnessUtilsMocks.channels[0]!;
    const stopTurn = await stoppedSession.doPromptTurn({
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
      implementation,
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
      implementation,
    });
    const firstSession = await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const firstChannel = harnessUtilsMocks.channels[0]!;
    const delivered: string[] = [];
    const firstTurn = await firstSession.doPromptTurn({
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
      implementation,
    });
    const initialSession = await harness.doStart({
      sessionId: 'session-replay',
      sandboxSession: sandbox,
      sessionWorkDir: '/workspace/user-project',
    });
    const initialChannel = harnessUtilsMocks.channels[0]!;
    const initialTurn = await initialSession.doPromptTurn({
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
      implementation,
      providerAuthentication: {
        gateway: {
          baseUrl: 'https://gateway.example.test/v1',
          route: {
            type: 'launch',
            env: {
              AI_GATEWAY_API_KEY: { $source: 'gateway-api-key' },
              AI_GATEWAY_BASE_URL: { $source: 'gateway-base-url' },
              AI_GATEWAY_CLIENT: { $source: 'client-app' },
            },
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
      prompt: 'Finish this durable operation.',
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
      recoveryStart: {
        providerProfile: {
          type: 'ai-gateway',
          baseUrl: 'https://gateway.example.test/v1',
          credentialSource: 'AI_GATEWAY_API_KEY',
          routeKind: 'launch',
        },
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
      implementation,
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
          toolCallId: 'client-call',
          output: { value: 42 },
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
      implementation,
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
          approvalResponse: {
            type: 'tool-approval-response',
            approvalId: 'native-approval',
            approved: true,
          },
          toolCall: {
            type: 'tool-call',
            toolCallId: 'native-call',
            toolName: 'bash',
            input: { command: 'pwd' },
            providerExecuted: true,
          },
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
        implementation,
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
      implementation,
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
      prompt: 'Run a native command.',
      emit: () => {},
    });
    const continued = await session.doContinueTurn({ emit: () => {} });

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
      implementation,
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

    const continued = await session.doContinueTurn({ emit: () => {} });
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
      implementation,
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
      implementation,
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
        implementation,
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
        implementation,
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
          toolCallId: 'client-call',
          output: { answer: 'Ada' },
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
      implementation,
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
      implementation,
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
      implementation: {
        ...implementation,
        forwardEnv: [],
      },
      providerAuthentication: {
        gateway: {
          route: {
            type: 'auth-method',
            methodId: 'gateway',
            clientCapabilities: {
              auth: { _meta: { gateway: true } },
            },
          },
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

  it('excludes resolved credentials from bootstrap and lifecycle state', async () => {
    vi.stubEnv('PROVIDER_API_KEY', 'direct-secret');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-secret');
    const runs: string[] = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const harness = createACP({
      harnessId: 'secret-safe-acp',
      auth: 'ai-gateway',
      implementation: {
        ...implementation,
        forwardEnv: ['PROVIDER_API_KEY'],
        env: {
          PROVIDER_BASE_URL: 'https://provider.example',
        },
      },
      providerAuthentication: {
        gateway: {
          baseUrl: 'https://gateway.example',
          route: {
            type: 'launch',
            env: {
              PROVIDER_API_KEY: { $source: 'gateway-api-key' },
            },
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
        gatewayRouteKind: 'launch',
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
      implementation: {
        ...implementation,
        forwardEnv: ['PROVIDER_API_KEY'],
      },
      providerAuthentication: {
        gateway: {
          route: {
            type: 'launch',
            env: {
              PROVIDER_API_KEY: { $source: 'gateway-api-key' },
            },
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

  it('rejects lifecycle state from an incompatible implementation identity', async () => {
    const first = createACP({
      harnessId: 'identity-acp',
      implementation,
    });
    const second = createACP({
      harnessId: 'identity-acp',
      implementation: {
        ...implementation,
        args: ['different'],
      },
    });
    const firstBootstrap = await first.getBootstrap!();
    const descriptorText = firstBootstrap.files.find(file =>
      file.path.endsWith('/implementation.json'),
    )?.content;
    expect(descriptorText).toBeDefined();
    const descriptor = await safeParseJSON({ text: descriptorText! });
    expect(descriptor.success).toBe(true);
    if (!descriptor.success) return;
    const implementationIdentity = (
      descriptor.value as { implementationIdentity: string }
    ).implementationIdentity;
    const authenticationProfile = createACPAuthenticationProfileIdentity({
      authentication: undefined,
      providerAuthenticationCompatibility: undefined,
    });

    const compatible = await safeValidateTypes({
      value: { implementationIdentity, authenticationProfile },
      schema: first.lifecycleStateSchema!,
    });
    const incompatible = await safeValidateTypes({
      value: { implementationIdentity, authenticationProfile },
      schema: second.lifecycleStateSchema!,
    });
    const legacyCompatible = await safeValidateTypes({
      value: {
        implementationIdentity,
        authenticationProfile: {
          ...authenticationProfile,
          providerKind: 'implementation-default',
        },
      },
      schema: first.lifecycleStateSchema!,
    });

    expect(compatible.success).toBe(true);
    expect(incompatible.success).toBe(false);
    expect(legacyCompatible).toMatchObject({
      success: true,
      value: {
        authenticationProfile: {
          providerKind: 'direct',
        },
      },
    });
  });
});
