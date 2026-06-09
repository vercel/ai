import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as NodeFsPromises from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClaudeCode } from './claude-code-harness';

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
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    readTextFile: async () => null,
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
    async getPortUrl() {
      return `ws://127.0.0.1:${port}`;
    },
    async stop() {},
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

describe('createClaudeCode adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares the harness id and builtin tools', () => {
    const harness = createClaudeCode();
    expect(harness.harnessId).toBe('claude-code');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
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
      'ListMcpResources',
      'ReadMcpResource',
      'ExitPlanMode',
      'EnterWorktree',
      'ExitWorktree',
      'AskUserQuestion',
      'Skill',
    ]);
    expect(harness.builtinTools.read.nativeName).toBe('Read');
    expect(harness.builtinTools.read.commonName).toBe('read');
    expect(harness.builtinTools.read.toolUseKind).toBe('readonly');
    expect(harness.builtinTools.write.toolUseKind).toBe('edit');
    expect(harness.builtinTools.bash.toolUseKind).toBe('bash');
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
        sessionWorkDir: '/vercel/sandbox/claude-code-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
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

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createClaudeCode();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('claude-code');
      expect(recipe.bootstrapDir).toBe('/tmp/harness/claude-code');
    });

    it('includes bridge.mjs, package.json, and pnpm-lock.yaml under the bootstrap dir', async () => {
      const harness = createClaudeCode();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(f => f.path).sort();
      expect(paths).toEqual([
        '/tmp/harness/claude-code/bridge.mjs',
        '/tmp/harness/claude-code/package.json',
        '/tmp/harness/claude-code/pnpm-lock.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('declares mkdir, pnpm install, and claude post-install commands', async () => {
      const harness = createClaudeCode();
      const recipe = await harness.getBootstrap!();
      const commands = recipe.commands.map(c => c.command);
      expect(commands[0]).toContain('mkdir -p /tmp/harness/claude-code');
      expect(commands[1]).toContain('pnpm');
      expect(commands[1]).toContain('install --frozen-lockfile');
      expect(commands[2]).toContain('claude --version');
    });

    it('caches the recipe across calls', async () => {
      const harness = createClaudeCode();
      const a = await harness.getBootstrap!();
      const b = await harness.getBootstrap!();
      expect(a).toBe(b);
    });
  });
});
