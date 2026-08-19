import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ClaudeMessage } from './create-emit-stream-event';

type QueryArgs = {
  options: Record<string, unknown>;
};

const TEST_ENV_KEYS = [
  'CLAUDE_CODE_BRIDGE_INHERITED_TEST',
  'CLAUDE_CODE_BRIDGE_OVERRIDE_TEST',
  'CLAUDE_CODE_BRIDGE_CONFIGURED_TEST',
] as const;

const state = vi.hoisted(() => ({
  queryArgs: [] as QueryArgs[],
  queryMessages: [] as Record<string, unknown>[],
  emitted: [] as Record<string, unknown>[],
  start: {} as Record<string, unknown>,
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) => {
    state.queryArgs.push(args);
    return (async function* () {
      yield* state.queryMessages;
    })();
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {},
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: async ({
    onStart,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
  }) => {
    await onStart(state.start, {
      abortSignal: new AbortController().signal,
      pendingUserMessages: [],
      firstTurn: true,
      emit: (event: Record<string, unknown>) => state.emitted.push(event),
      emitWarning: () => {},
      emitError: () => {},
      bridgeLog: () => {},
      requestToolResult: async () => ({ output: {} }),
      requestToolApproval: async () => ({ approved: true }),
    });
  },
}));

describe('Claude Code bridge configuration', () => {
  beforeEach(() => {
    state.queryArgs = [];
    state.queryMessages = [
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
      },
    ];
    state.emitted = [];
    state.start = {
      prompt: 'Inspect the project.',
      thinking: { type: 'disabled' },
    };
    state.originalArgv = [...process.argv];
    state.originalEnv = Object.fromEntries(
      TEST_ENV_KEYS.map(key => [key, process.env[key]]),
    );
    for (const key of TEST_ENV_KEYS) {
      delete process.env[key];
    }
    process.argv.splice(
      0,
      process.argv.length,
      'node',
      'bridge.mjs',
      '--workdir',
      '/tmp/harness-claude-code-test/work',
      '--bridge-state-dir',
      '/tmp/harness-claude-code-test/state',
    );
  });

  afterEach(() => {
    process.argv.splice(0, process.argv.length, ...state.originalArgv);
    for (const key of TEST_ENV_KEYS) {
      const value = state.originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.resetModules();
  });

  test('merges the configured environment', async () => {
    process.env.CLAUDE_CODE_BRIDGE_INHERITED_TEST = 'inherited';
    process.env.CLAUDE_CODE_BRIDGE_OVERRIDE_TEST = 'inherited';
    state.start = {
      ...state.start,
      env: {
        CLAUDE_CODE_BRIDGE_OVERRIDE_TEST: 'configured',
        CLAUDE_CODE_BRIDGE_CONFIGURED_TEST: 'configured',
      },
    };

    await import('./index');

    const options = state.queryArgs[0]?.options;
    expect(options?.env).toMatchObject({
      CLAUDE_CODE_BRIDGE_INHERITED_TEST: 'inherited',
      CLAUDE_CODE_BRIDGE_OVERRIDE_TEST: 'configured',
      CLAUDE_CODE_BRIDGE_CONFIGURED_TEST: 'configured',
    });
  });

  test('lets the Agent SDK inherit the environment when none is configured', async () => {
    await import('./index');

    expect(state.queryArgs[0]?.options).not.toHaveProperty('env');
  });

  test('passes the configured effort to the Agent SDK', async () => {
    state.start = { ...state.start, effort: 'max' };

    await import('./index');

    expect(state.queryArgs[0]?.options).toMatchObject({ effort: 'max' });
  });

  test('passes the requested JSON schema to the Agent SDK', async () => {
    const schema = {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    };
    state.start = {
      ...state.start,
      responseFormat: { type: 'json', schema },
    };

    await import('./index');

    expect(state.queryArgs[0]?.options).toMatchObject({
      outputFormat: { type: 'json_schema', schema },
    });
  });

  test('reports the final model call usage on its finish-step', async () => {
    state.queryMessages = JSON.parse(
      readFileSync(
        new URL('./__fixtures__/multi-step-usage-stream.json', import.meta.url),
        'utf8',
      ),
    ) as ClaudeMessage[];
    state.start = {
      prompt:
        'Use the Bash tool exactly once to run `printf 19068`, then reply with only the text done.',
      thinking: { type: 'disabled' },
      permissionMode: 'allow-all',
      builtinToolFiltering: { mode: 'allow', toolNames: ['bash'] },
    };

    await import('./index');

    const finishSteps = state.emitted.filter(
      event => event.type === 'finish-step',
    );
    const finish = state.emitted.find(event => event.type === 'finish');

    expect(finishSteps).toHaveLength(2);
    expect(finishSteps[1].usage).toEqual({
      inputTokens: {
        total: 6410,
        noCache: 2,
        cacheRead: 6323,
        cacheWrite: 85,
      },
      outputTokens: { total: 1, text: 1 },
    });
    expect(finish?.totalUsage).toEqual({
      inputTokens: {
        total: 12735,
        noCache: 4,
        cacheRead: 6323,
        cacheWrite: 6408,
      },
      outputTokens: { total: 81, text: 81 },
    });
  });
});
