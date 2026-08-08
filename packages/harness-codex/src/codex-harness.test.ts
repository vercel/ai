import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCodex } from './codex-harness';

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    async open(): Promise<void> {}
    on(): () => void {
      return () => {};
    }
    onClose(): void {}
    send(): void {}
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
  spawnCalls,
  directories,
  writes,
  defaultWorkingDirectory = '/vercel/sandbox',
  homeDirectory,
  pathDialect = path.posix,
}: {
  bridgePortUrl: string;
  runs: string[];
  spawns: string[];
  spawnEnvs?: Array<Record<string, string | undefined>>;
  spawnCalls?: Array<Record<string, unknown>>;
  directories?: string[];
  writes: Array<{ path: string; content: string }>;
  defaultWorkingDirectory?: string;
  homeDirectory?: string;
  pathDialect?: typeof path.posix | typeof path.win32;
}): HarnessV1NetworkSandboxSession {
  const spawnProcess = async (options: Record<string, unknown>) => {
    const command = options.command;
    const env = options.env as Record<string, string | undefined> | undefined;
    spawns.push(
      typeof command === 'string' ? command : String(options.executable ?? ''),
    );
    spawnCalls?.push(options);
    if (env) spawnEnvs?.push(env);
    return {
      stdout: textStream('{"type":"bridge-ready","port":4319}\n'),
      stderr: textStream(''),
      kill: async () => {},
      wait: async () => ({ exitCode: 0 }),
    };
  };
  const session = {
    homeDirectory:
      homeDirectory ?? pathDialect.resolve(defaultWorkingDirectory, '..'),
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
    spawn: spawnProcess,
    spawnExecutable: spawnProcess,
    resolvePath: ({
      base,
      segments,
    }: {
      base?: string;
      segments: ReadonlyArray<string>;
    }) => pathDialect.resolve(base ?? defaultWorkingDirectory, ...segments),
    ensureDirectory: async ({ path }: { path: string }) => {
      directories?.push(path);
    },
  };
  return {
    id: 'test-sandbox',
    defaultWorkingDirectory,
    restricted: () => session,
    ports: [4319],
    async getPortUrl() {
      return bridgePortUrl;
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

describe('createCodex adapter', () => {
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
    expect(session.modelId).toBe('gpt-5.5');
    await session.doDestroy();
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

    it('uses immutable no-install bootstrap identity for a preinstalled bridge', async () => {
      const harness = createCodex({
        preinstalledBridge: {
          identity: 'codex-bridge-v1',
          nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
          entrypoint: 'C:\\AI SDK\\bridge runtime\\bridge.mjs',
        },
      });

      const recipe = await harness.getBootstrap!();
      expect(recipe.identity).toContain('codex-bridge-v1');
      expect(recipe.files).toEqual([]);
      expect(recipe.commands).toEqual([]);

      const relocatedRecipe = await createCodex({
        preinstalledBridge: {
          identity: 'codex-bridge-v1',
          nodeExecutable: 'D:\\Runtime\\node.exe',
          entrypoint: 'D:\\Runtime\\bridge.mjs',
        },
      }).getBootstrap!();
      const upgradedRecipe = await createCodex({
        preinstalledBridge: {
          identity: 'codex-bridge-v2',
          nodeExecutable: 'D:\\Runtime\\node.exe',
          entrypoint: 'D:\\Runtime\\bridge.mjs',
        },
      }).getBootstrap!();
      expect(relocatedRecipe).toEqual(recipe);
      expect(upgradedRecipe.identity).not.toBe(recipe.identity);
    });
  });

  it('launches a preinstalled Windows bridge with argv and no shell setup', async () => {
    const runs: string[] = [];
    const spawns: string[] = [];
    const spawnCalls: Array<Record<string, unknown>> = [];
    const directories: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const harness = createCodex({
      preinstalledBridge: {
        identity: 'codex-bridge-v1',
        nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
        entrypoint: 'C:\\AI SDK\\bridge runtime\\bridge.mjs',
      },
    });
    const sandboxSession = fakeNetworkSandboxSessionForStartupSuccess({
      bridgePortUrl: 'ws://127.0.0.1:1',
      runs,
      spawns,
      spawnCalls,
      directories,
      writes,
      defaultWorkingDirectory: 'C:\\Users\\Ada\\Work Machine',
      homeDirectory: 'C:\\Users\\Ada',
      pathDialect: path.win32,
    });
    const skills = [
      {
        name: 'review',
        description: 'Review changes.',
        content: 'Check the diff.',
      },
    ];

    const session = await harness.doStart({
      sessionId: 'session with spaces',
      sandboxSession,
      sessionWorkDir: 'C:\\Users\\Ada\\Work Machine\\repo with spaces',
      skills,
    });

    expect(runs).toEqual([]);
    expect(directories).toEqual([
      'C:\\Users\\Ada\\.codex',
      'C:\\Users\\Ada\\.agents\\skills',
      'C:\\Users\\Ada\\Work Machine\\repo with spaces',
      'C:\\Users\\Ada\\Work Machine\\.agent-runs\\session with spaces\\bridge',
    ]);
    expect(writes).toContainEqual({
      path: 'C:\\Users\\Ada\\.agents\\skills\\review\\SKILL.md',
      content:
        '---\nname: review\ndescription: Review changes.\n---\n\nCheck the diff.',
    });
    expect(spawnCalls).toEqual([
      expect.objectContaining({
        executable: 'C:\\Program Files\\nodejs\\node.exe',
        args: [
          'C:\\AI SDK\\bridge runtime\\bridge.mjs',
          '--workdir',
          'C:\\Users\\Ada\\Work Machine\\repo with spaces',
          '--bridge-state-dir',
          'C:\\Users\\Ada\\Work Machine\\.agent-runs\\session with spaces\\bridge',
          '--cli-shim-dir',
          'C:\\Users\\Ada\\Work Machine\\.agent-runs\\session with spaces\\codex',
        ],
      }),
    ]);
    expect(spawns).toEqual(['C:\\Program Files\\nodejs\\node.exe']);
    await session.doDestroy();
    const resumed = await harness.doStart({
      sessionId: 'session with spaces',
      sandboxSession,
      sessionWorkDir: 'C:\\Users\\Ada\\Work Machine\\repo with spaces',
      skills,
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: { threadId: 'thread-abc' },
      },
    });
    expect(runs).toEqual([]);
    expect(spawns).toEqual([
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files\\nodejs\\node.exe',
    ]);
    await resumed.doDestroy();
  });
});
