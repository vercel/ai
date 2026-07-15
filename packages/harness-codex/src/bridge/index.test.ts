import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CodexOptions = {
  codexPathOverride?: string;
  config?: { mcp_servers?: unknown };
};

const ENV_KEYS = [
  'AI_GATEWAY_API_KEY',
  'AI_GATEWAY_BASE_URL',
  'OPENAI_BASE_URL',
  'CODEX_API_KEY',
  'CODEX_PATH',
  'CODEX_CLI',
  'CODEX_BINARY',
  'PATH',
] as const;

const state = vi.hoisted(() => ({
  codexOptions: [] as CodexOptions[],
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
}));

vi.mock('@openai/codex-sdk', () => ({
  Codex: class {
    constructor(options: CodexOptions) {
      state.codexOptions.push(options);
    }

    startThread() {
      return {
        runStreamed: async () => ({
          events: (async function* () {
            yield { type: 'turn.completed' };
          })(),
        }),
      };
    }

    resumeThread() {
      return this.startThread();
    }
  },
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: async ({
    onStart,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
  }) => {
    await onStart(
      {
        prompt: 'Use the weather tool.',
        tools: [
          {
            name: 'get_weather',
            description: 'Get the weather.',
            inputSchema: { type: 'object' },
          },
        ],
      },
      {
        emit: () => {},
        emitWarning: () => {},
        emitError: () => {},
        requestToolResult: async () => ({ output: {} }),
        abortSignal: new AbortController().signal,
        pendingUserMessages: [],
      },
    );
  },
}));

describe('Codex bridge config', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    state.codexOptions = [];
    state.originalArgv = [...process.argv];
    state.originalEnv = Object.fromEntries(
      ENV_KEYS.map(key => [key, process.env[key]]),
    );
    for (const key of ENV_KEYS) delete process.env[key];
    process.argv.splice(
      0,
      process.argv.length,
      'node',
      'bridge.mjs',
      '--workdir',
      '/tmp/harness-codex-test/work',
      '--bridge-state-dir',
      '/tmp/harness-codex-test/state',
      '--cli-shim-dir',
      '/tmp/harness-codex-test/shim',
    );
  });

  afterEach(async () => {
    process.argv.splice(0, process.argv.length, ...state.originalArgv);
    for (const key of ENV_KEYS) {
      const value = state.originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(
      tempDirs
        .splice(0)
        .map(path => rm(path, { recursive: true, force: true })),
    );
    vi.resetModules();
  });

  it('does not register host tools as Codex MCP servers', async () => {
    await import('./index');

    expect(state.codexOptions).toHaveLength(1);
    expect(state.codexOptions[0]?.config?.mcp_servers).toBeUndefined();
  });

  it.each(['CODEX_PATH', 'CODEX_CLI', 'CODEX_BINARY'] as const)(
    'passes %s as codexPathOverride',
    async key => {
      process.env[key] = ' /opt/codex/custom ';

      await import('./index');

      expect(state.codexOptions[0]?.codexPathOverride).toBe(
        '/opt/codex/custom',
      );
    },
  );

  it('uses the first non-empty explicit executable', async () => {
    process.env.CODEX_PATH = ' ';
    process.env.CODEX_CLI = ' /opt/codex/cli ';
    process.env.CODEX_BINARY = '/opt/codex/binary';

    await import('./index');

    expect(state.codexOptions[0]?.codexPathOverride).toBe('/opt/codex/cli');
  });

  it('uses an executable codex on PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'harness-codex-'));
    tempDirs.push(dir);
    const executable = join(
      dir,
      process.platform === 'win32' ? 'codex.exe' : 'codex',
    );
    await writeFile(executable, '');
    await chmod(executable, 0o755);
    process.env.PATH = [dir, '/not-a-real-bin'].join(delimiter);

    await import('./index');

    expect(state.codexOptions[0]?.codexPathOverride).toBe(executable);
  });

  it('leaves the SDK bundled executable as the fallback', async () => {
    process.env.PATH = '/not-a-real-bin';

    await import('./index');

    expect(state.codexOptions[0]).not.toHaveProperty('codexPathOverride');
  });
});
