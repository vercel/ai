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
  queryArgs: [] as QueryArgs[],
  start: {} as Record<string, unknown>,
  messages: undefined as Array<Record<string, unknown>> | undefined,
  emitted: [] as Array<Record<string, unknown>>,
  onStop: undefined as (() => unknown) | undefined,
  firstTurn: true,
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) => {
    state.queryArgs.push(args);
    const messages = state.messages ?? [
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
      },
    ];
    return (async function* () {
      yield* messages;
    })();
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {},
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: async ({
    onStart,
    onStop,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
    onStop?: () => unknown;
  }) => {
    state.onStop = onStop;
    await onStart(state.start, {
      abortSignal: new AbortController().signal,
      pendingUserMessages: [],
      firstTurn: state.firstTurn,
      emit: (msg: Record<string, unknown>) => {
        state.emitted.push(msg);
      },
      emitWarning: () => {},
      emitError: () => {},
      requestToolResult: async () => ({ output: {} }),
      requestToolApproval: async () => ({ approved: true }),
    });
  },
}));

describe('Claude Code bridge configuration', () => {
  beforeEach(() => {
    state.queryArgs = [];
    state.messages = undefined;
    state.emitted = [];
    state.onStop = undefined;
    state.firstTurn = true;
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

  test('points the Agent SDK at the environment executable', async () => {
    state.start = {
      ...state.start,
      claudeExecutablePath: '/usr/local/bin/claude',
    };

    await import('./index');

    expect(state.queryArgs[0]?.options).toMatchObject({
      pathToClaudeCodeExecutable: '/usr/local/bin/claude',
    });
  });

  test('resumes the exact conversation when the start names one', async () => {
    state.start = { ...state.start, resumeSessionId: 'claude-session-1' };

    await import('./index');

    const options = state.queryArgs[0]?.options;
    expect(options).toMatchObject({ resume: 'claude-session-1' });
    // `resume` and `continue` are mutually exclusive in the SDK.
    expect(options).not.toHaveProperty('continue');
  });

  test('falls back to continue when no exact conversation is named', async () => {
    state.start = { ...state.start, continue: true };

    await import('./index');

    expect(state.queryArgs[0]?.options).toMatchObject({ continue: true });
    expect(state.queryArgs[0]?.options).not.toHaveProperty('resume');
  });

  test('surfaces the observed session id on finish metadata and the stop payload', async () => {
    state.messages = [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-2',
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
        session_id: 'claude-session-2',
      },
    ];

    await import('./index');

    const finish = state.emitted.find(msg => msg.type === 'finish');
    expect(finish?.harnessMetadata).toMatchObject({
      'claude-code': { sessionId: 'claude-session-2' },
    });
    expect(state.onStop?.()).toEqual({ claudeSessionId: 'claude-session-2' });
  });

  test('reports an empty stop payload when no session id was observed', async () => {
    await import('./index');

    expect(state.onStop?.()).toEqual({});
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
});
