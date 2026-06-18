import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentMessages: Array<Record<string, unknown>> = [];

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    async open(): Promise<void> {}
    on(): () => void {
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
    close(): void {}
    async suspend(): Promise<number> {
      return 0;
    }
  }
  return { ...actual, SandboxChannel: FakeSandboxChannel };
});

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const p = String(input);
      if (p.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (p.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (p.endsWith('/bridge/pnpm-lock.yaml')) return 'lockfileVersion: 9\n';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFile as any)(input, ...rest);
    }),
  };
});

// eslint-disable-next-line import/first
import {
  createGrokBuild,
  GROK_BUILD_BUILTIN_TOOLS,
  toCommonName,
} from './grok-build-harness';

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

function fakeSandbox({
  spawnCalls,
  runs,
}: {
  spawnCalls: Array<{ command: string; env: Record<string, string> }>;
  runs: string[];
}): HarnessV1NetworkSandboxSession {
  const session = {
    run: async ({ command }: { command: string }) => {
      runs.push(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async ({
      command,
      env,
    }: {
      command: string;
      env: Record<string, string>;
    }) => {
      spawnCalls.push({ command, env });
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
    async getPortUrl() {
      return 'ws://127.0.0.1:4319';
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

describe('grok-build builtin tools', () => {
  it('exposes common tool names', () => {
    expect(Object.keys(GROK_BUILD_BUILTIN_TOOLS)).toEqual(
      expect.arrayContaining(['read', 'write', 'edit', 'bash']),
    );
  });

  it('maps a native name to its common name', () => {
    expect(toCommonName('Read')).toBe('read');
  });

  it('passes through unknown native names unchanged', () => {
    expect(toCommonName('SomeGrokSpecificTool')).toBe('SomeGrokSpecificTool');
  });
});

describe('grok-build bootstrap', () => {
  it('produces a bootstrap recipe under the adapter-owned dir', async () => {
    const harness = createGrokBuild();
    const bootstrap = await harness.getBootstrap!();
    expect(bootstrap.harnessId).toBe('grok-build');
    expect(bootstrap.bootstrapDir).toBe('/tmp/harness/grok-build');
    const paths = bootstrap.files.map(f => f.path);
    expect(paths).toContain('/tmp/harness/grok-build/package.json');
    expect(paths).toContain('/tmp/harness/grok-build/pnpm-lock.yaml');
    expect(paths).toContain('/tmp/harness/grok-build/bridge.mjs');
    expect(bootstrap.commands.some(c => c.command.includes('pnpm'))).toBe(true);
  });
});

describe('grok-build doStart', () => {
  beforeEach(() => {
    sentMessages.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects built-in permission modes other than allow-all', async () => {
    const harness = createGrokBuild();
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession: {} as HarnessV1NetworkSandboxSession,
        sessionWorkDir: '/vercel/sandbox/grok-s1',
        permissionMode: 'allow-edits',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('throws when the network sandbox exposes no ports', async () => {
    const harness = createGrokBuild();
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/vercel/sandbox',
      restricted: () => ({}) as never,
      ports: [] as ReadonlyArray<number>,
      async getPortUrl() {
        return '';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/vercel/sandbox/grok-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('spawns the bridge with the workdir and mapped direct grok env', async () => {
    const harness = createGrokBuild({ auth: { xai: { apiKey: 'sk-direct' } } });
    const spawnCalls: Array<{
      command: string;
      env: Record<string, string>;
    }> = [];
    const runs: string[] = [];
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeSandbox({ spawnCalls, runs }),
      sessionWorkDir: '/vercel/sandbox/grok-s1',
      permissionMode: 'allow-all',
    });

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].command).toContain(
      "node '/tmp/harness/grok-build/bridge.mjs' --workdir '/vercel/sandbox/grok-s1'",
    );
    // Mapped direct-xai env var is forwarded to the bridge process.
    expect(spawnCalls[0].env.XAI_API_KEY).toBe('sk-direct');
    expect(spawnCalls[0].env.BRIDGE_WS_PORT).toBe('4319');
    expect(spawnCalls[0].env.BRIDGE_CHANNEL_TOKEN).toBeTruthy();
    // Direct route pins the bare model id.
    expect(session.modelId).toBe('grok-build-0.1');
    expect(session.isResume).toBe(false);
  });

  it('uses the gateway-prefixed model id and mapped gateway env', async () => {
    const harness = createGrokBuild({
      auth: { gateway: { apiKey: 'gw-key', baseUrl: 'https://gw/v1' } },
    });
    const spawnCalls: Array<{
      command: string;
      env: Record<string, string>;
    }> = [];
    const runs: string[] = [];
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeSandbox({ spawnCalls, runs }),
      sessionWorkDir: '/vercel/sandbox/grok-s1',
      permissionMode: 'allow-all',
    });

    expect(spawnCalls[0].env.GROK_CODE_XAI_API_KEY).toBe('gw-key');
    expect(spawnCalls[0].env.GROK_MODELS_BASE_URL).toBe('https://gw/v1');
    expect(spawnCalls[0].env.XAI_API_KEY).toBeUndefined();
    expect(session.modelId).toBe('xai/grok-build-0.1');
  });

  it('sends a start message on doPromptTurn carrying the model', async () => {
    const harness = createGrokBuild({ auth: { xai: { apiKey: 'sk' } } });
    const spawnCalls: Array<{
      command: string;
      env: Record<string, string>;
    }> = [];
    const runs: string[] = [];
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeSandbox({ spawnCalls, runs }),
      sessionWorkDir: '/vercel/sandbox/grok-s1',
      permissionMode: 'allow-all',
    });

    await session.doPromptTurn({ prompt: 'hello', emit: () => {} });
    const start = sentMessages.find(m => m.type === 'start');
    expect(start).toMatchObject({
      type: 'start',
      prompt: 'hello',
      model: 'grok-build-0.1',
    });
  });

  it('sends a continuation start message with continue:true on doContinueTurn', async () => {
    const harness = createGrokBuild({ auth: { xai: { apiKey: 'sk' } } });
    const spawnCalls: Array<{
      command: string;
      env: Record<string, string>;
    }> = [];
    const runs: string[] = [];
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeSandbox({ spawnCalls, runs }),
      sessionWorkDir: '/vercel/sandbox/grok-s1',
      permissionMode: 'allow-all',
    });

    await session.doContinueTurn({ emit: () => {} });
    const start = sentMessages.find(m => m.type === 'start');
    expect(start).toMatchObject({ type: 'start', continue: true });
  });

  it('reports isResume when resumeFrom carries a grok session id', async () => {
    const harness = createGrokBuild({ auth: { xai: { apiKey: 'sk' } } });
    const spawnCalls: Array<{
      command: string;
      env: Record<string, string>;
    }> = [];
    const runs: string[] = [];
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeSandbox({ spawnCalls, runs }),
      sessionWorkDir: '/vercel/sandbox/grok-s1',
      permissionMode: 'allow-all',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'grok-build',
        specificationVersion: 'harness-v1',
        data: { sessionId: 'grok-sess-123' },
      },
    });
    expect(session.isResume).toBe(true);
  });

  it('rejects manual compaction', async () => {
    const harness = createGrokBuild({ auth: { xai: { apiKey: 'sk' } } });
    const spawnCalls: Array<{
      command: string;
      env: Record<string, string>;
    }> = [];
    const runs: string[] = [];
    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession: fakeSandbox({ spawnCalls, runs }),
      sessionWorkDir: '/vercel/sandbox/grok-s1',
      permissionMode: 'allow-all',
    });
    await expect(session.doCompact!()).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });
});
