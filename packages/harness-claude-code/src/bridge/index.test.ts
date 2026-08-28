import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type QueryArgs = {
  prompt: AsyncIterable<unknown>;
  options: Record<string, unknown>;
};

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

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
  steering: false,
  acceptedUserMessages: [] as string[],
  queryInputs: [] as unknown[],
  toolHandlers: new Map<string, ToolHandler>(),
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
      for (const message of state.messages) {
        if (message.type === 'invoke-host-tool') {
          const toolName = String(message.toolName);
          const handler = state.toolHandlers.get(toolName);
          if (handler == null) {
            throw new Error(`Missing host tool handler for '${toolName}'.`);
          }
          await handler(message.input as Record<string, unknown>);
          continue;
        }
        yield message;
      }
    })();
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(...args: [string, string, unknown, ToolHandler]): void {
      const name = args[0];
      const handler = args[3];
      state.toolHandlers.set(name, handler);
    }
  },
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
    state.steering = false;
    state.acceptedUserMessages = [];
    state.queryInputs = [];
    state.toolHandlers = new Map();
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

  test('uses the streamed tool-use id for a host tool call', async () => {
    state.start = {
      ...state.start,
      tools: [
        {
          name: 'weather',
          description: 'Get the weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    };
    state.messages = [
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'host-tool-1',
            name: 'mcp__harness-tools__weather',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"city":"Chicago"}',
          },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
      },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'host-tool-1',
              name: 'mcp__harness-tools__weather',
              input: { city: 'Chicago' },
            },
          ],
        },
      },
      {
        type: 'invoke-host-tool',
        toolName: 'weather',
        input: { city: 'Chicago' },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'host-tool-1',
              content: '{}',
            },
          ],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
      },
    ];

    await import('./index');

    expect(
      state.emitted.filter(event =>
        [
          'tool-input-start',
          'tool-input-delta',
          'tool-input-end',
          'tool-call',
          'tool-result',
        ].includes(String(event.type)),
      ),
    ).toEqual([
      {
        type: 'tool-input-start',
        id: 'host-tool-1',
        toolName: 'weather',
        providerExecuted: false,
      },
      {
        type: 'tool-input-delta',
        id: 'host-tool-1',
        delta: '{"city":"Chicago"}',
      },
      { type: 'tool-input-end', id: 'host-tool-1' },
      {
        type: 'tool-call',
        toolCallId: 'host-tool-1',
        toolName: 'weather',
        input: '{"city":"Chicago"}',
        providerExecuted: false,
      },
      {
        type: 'tool-result',
        toolCallId: 'host-tool-1',
        toolName: 'weather',
        result: {},
        isError: false,
      },
    ]);
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
