import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type QueryArgs = {
  options: Record<string, unknown>;
};

const TEST_ENV_KEYS = [
  'CLAUDE_CODE_BRIDGE_INHERITED_TEST',
  'CLAUDE_CODE_BRIDGE_OVERRIDE_TEST',
  'CLAUDE_CODE_BRIDGE_CONFIGURED_TEST',
] as const;

const state = vi.hoisted(() => ({
  emitted: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  queryArgs: [] as QueryArgs[],
  start: {} as Record<string, unknown>,
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) => {
    state.queryArgs.push(args);
    return (async function* () {
      for (const message of state.messages) {
        yield message;
      }
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
      requestToolResult: async () => ({ output: {} }),
      requestToolApproval: async () => ({ approved: true }),
    });
  },
}));

describe('Claude Code bridge configuration', () => {
  beforeEach(() => {
    state.emitted = [];
    state.messages = [
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
      },
    ];
    state.queryArgs = [];
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

  test('reports only the final model call usage for the final step', async () => {
    state.messages = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pwd' },
            },
          ],
          usage: { input_tokens: 10, output_tokens: 2 },
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: '/tmp',
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 20, output_tokens: 3 },
        },
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
        usage: { input_tokens: 30, output_tokens: 5 },
      },
    ];

    await import('./index');

    const finishSteps = state.emitted.filter(
      event => event.type === 'finish-step',
    );
    const finish = state.emitted.find(event => event.type === 'finish');

    expect(finishSteps).toHaveLength(2);
    expect(finishSteps[1]?.usage).toEqual({
      inputTokens: {
        total: 20,
        noCache: 20,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 3, text: 3 },
    });
    expect(finish?.totalUsage).toEqual({
      inputTokens: {
        total: 30,
        noCache: 30,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 5, text: 5 },
    });
  });
});
