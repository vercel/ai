import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type QueryArgs = {
  prompt: AsyncIterable<unknown>;
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
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
  steering: false,
  acceptedUserMessages: [] as string[],
  queryInputs: [] as unknown[],
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) => {
    state.queryArgs.push(args);
    return (async function* () {
      if (state.steering) {
        const input = args.prompt[Symbol.asyncIterator]();
        const initial = await input.next();
        const steering = await input.next();
        state.queryInputs.push(initial.value, steering.value);
        const steeringUuid = Reflect.get(steering.value as object, 'uuid');
        yield {
          type: 'result',
          subtype: 'success',
          result: 'initial result',
        };
        yield {
          type: 'command_lifecycle',
          command_uuid: steeringUuid,
          state: 'queued',
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'steered result',
        };
        yield {
          type: 'command_lifecycle',
          command_uuid: steeringUuid,
          state: 'completed',
        };
        return;
      }
      yield {
        type: 'result',
        subtype: 'success',
        result: 'done',
      };
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
      experimental_userMessages: {
        pendingCount: state.steering ? 1 : 0,
        close: () => {},
        [Symbol.asyncIterator]: async function* () {
          if (!state.steering) return;
          yield {
            messageId: 'steering-message-1',
            text: 'Actually, Paris, Texas.',
            accept: () => state.acceptedUserMessages.push('steering-message-1'),
            reject: () => {},
          };
        },
      },
      firstTurn: true,
      emit: () => {},
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
    state.start = {
      prompt: 'Inspect the project.',
      thinking: { type: 'disabled' },
    };
    state.steering = false;
    state.acceptedUserMessages = [];
    state.queryInputs = [];
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

  test('keeps the query open past the first result for an accepted steering message', async () => {
    state.steering = true;

    await import('./index');

    expect(state.acceptedUserMessages).toEqual(['steering-message-1']);
    expect(state.queryInputs).toHaveLength(2);
    expect(state.queryInputs[0]).toMatchObject({
      type: 'user',
      parent_tool_use_id: null,
      uuid: expect.any(String),
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Inspect the project.' }],
      },
    });
    expect(state.queryInputs[1]).toMatchObject({
      type: 'user',
      parent_tool_use_id: null,
      uuid: 'steering-message-1',
      priority: 'next',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Actually, Paris, Texas.' }],
      },
    });
  });
});
