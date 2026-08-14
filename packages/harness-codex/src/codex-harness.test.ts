import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCodex } from './codex-harness';

const sentMessages: unknown[] = [];

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    async open(): Promise<void> {}
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
  runs,
  spawns,
  spawnEnvs,
  writes,
  addRequestTransformations = async () => {},
}: {
  bridgePortUrl: string;
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
        sessionWorkDir: '/vercel/sandbox/codex-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
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
    expect(session.modelId).toBe('gpt-5.5');
    await session.doDestroy();
  });

  it('brokers credentials when the sandbox supports additive request transformations', async () => {
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
      auth: {
        openai: {
          apiKey: 'openai-secret',
          baseUrl: 'https://openai.example/v1',
        },
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
        },
        transform: {
          headers: { Authorization: 'Bearer openai-secret' },
        },
      },
    ]);
    expect(spawnEnvs.at(0)?.CODEX_API_KEY).toBe('CODEX_API_KEY');
    expect(JSON.stringify(spawnEnvs.at(0))).not.toContain('openai-secret');

    await session.doDestroy();
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
      auth: { openai: { apiKey: 'openai-secret' } },
    });

    const session = await harness.doStart({
      sessionId: 's1',
      sandboxSession,
      sessionWorkDir: '/vercel/sandbox/codex-s1',
    });

    expect(addRequestTransformations).toHaveBeenCalledWith([
      {
        match: {
          host: 'api.openai.com',
          path: { startsWith: '/v1' },
        },
        transform: {
          headers: { Authorization: 'Bearer openai-secret' },
        },
      },
    ]);
    expect(spawnEnvs.at(0)?.CODEX_API_KEY).toBe('CODEX_API_KEY');
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
