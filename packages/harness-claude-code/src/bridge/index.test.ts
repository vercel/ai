import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type QueryArgs = {
  prompt: AsyncIterable<unknown>;
  options: Record<string, unknown>;
};

type ToolHandler = (
  ...args: [
    input: Record<string, unknown>,
    extra: {
      requestId: string | number;
      _meta?: Record<string, unknown>;
    },
  ]
) => Promise<unknown>;

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
  additionalTurns: [] as Array<{
    start: Record<string, unknown>;
    firstTurn: boolean;
  }>,
  onStop: undefined as (() => unknown) | undefined,
  firstTurn: true,
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
  steering: false,
  acceptedUserMessages: [] as string[],
  queryInputs: [] as unknown[],
  toolHandlers: new Map<string, ToolHandler>(),
  /** Per-test query factory; falls back to the `state.messages` generator. */
  createQuery: undefined as ((args: QueryArgs) => unknown) | undefined,
  /** Per-test turn abort controller; defaults to a fresh, never-aborted one. */
  turnAbortController: undefined as AbortController | undefined,
  /** Per-test error sink; defaults to a no-op. */
  emitError: undefined as ((input: unknown) => void) | undefined,
  requestToolResult: undefined as
    | ((input: Record<string, unknown>) => Promise<Record<string, unknown>>)
    | undefined,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) => {
    state.queryArgs.push(args);
    if (state.createQuery) return state.createQuery(args);
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
        if (message.type === 'invoke-host-tools') {
          const calls = message.calls as Array<{
            toolName: string;
            toolCallId: string;
            input: Record<string, unknown>;
          }>;
          await Promise.all(
            calls.map(call => {
              const handler = state.toolHandlers.get(call.toolName);
              if (handler == null) {
                throw new Error(
                  `Missing host tool handler for '${call.toolName}'.`,
                );
              }
              const handlerArgs: Parameters<ToolHandler> = [
                call.input,
                {
                  requestId: call.toolCallId,
                  _meta: {
                    'claudecode/toolUseId': call.toolCallId,
                  },
                },
              ];
              return handler(...handlerArgs);
            }),
          );
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
    onStop,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
    onStop?: () => unknown;
  }) => {
    state.onStop = onStop;
    for (const turn of [
      { start: state.start, firstTurn: state.firstTurn },
      ...state.additionalTurns,
    ]) {
      await onStart(turn.start, {
        abortSignal: (state.turnAbortController ?? new AbortController())
          .signal,
        experimental_userMessages: {
          pendingCount: state.steering ? 1 : 0,
          close: () => {},
          [Symbol.asyncIterator]: async function* () {
            if (!state.steering) return;
            yield {
              messageId: 'steering-message-1',
              text: 'Actually, Paris, Texas.',
              accept: () =>
                state.acceptedUserMessages.push('steering-message-1'),
              reject: () => {},
            };
          },
        },
        firstTurn: turn.firstTurn,
        emit: (event: Record<string, unknown>) => state.emitted.push(event),
        emitWarning: () => {},
        emitError: (input: unknown) => state.emitError?.(input),
        requestToolResult: async (input: Record<string, unknown>) =>
          state.requestToolResult?.(input) ?? { output: {} },
        requestToolApproval: async () => ({ approved: true }),
      });
    }
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
    state.createQuery = undefined;
    state.turnAbortController = undefined;
    state.emitError = undefined;
    state.requestToolResult = undefined;
    state.onStop = undefined;
    state.firstTurn = true;
    state.additionalTurns = [];
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

  test('resumes the exact conversation when the start names one', async () => {
    state.start = { ...state.start, resumeSessionId: 'claude-session-1' };
    state.firstTurn = false;

    await import('./index');

    const options = state.queryArgs[0]?.options;
    expect(options).toMatchObject({ resume: 'claude-session-1' });
    // `resume` and `continue` are mutually exclusive in the SDK.
    expect(options).not.toHaveProperty('continue');
  });

  test('resumes the observed conversation on every subsequent query', async () => {
    state.messages = [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-1',
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
        session_id: 'claude-session-1',
      },
    ];
    state.additionalTurns = [
      {
        start: { ...state.start, prompt: 'Continue the work.' },
        firstTurn: false,
      },
    ];

    await import('./index');

    expect(state.queryArgs).toHaveLength(2);
    expect(state.queryArgs[1]?.options).toMatchObject({
      resume: 'claude-session-1',
    });
    expect(state.queryArgs[1]?.options).not.toHaveProperty('continue');
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

  test('marks approval-gated external MCP tool calls as dynamic', async () => {
    state.start = {
      ...state.start,
      permissionMode: 'allow-reads',
    };

    await import('./index');

    const canUseTool = state.queryArgs[0]?.options.canUseTool as
      | ((
          toolName: string,
          toolInput: Record<string, unknown>,
          options: { toolUseID: string },
        ) => Promise<unknown>)
      | undefined;
    await canUseTool?.(
      'mcp__context7__query-docs',
      { libraryId: '/vercel/next.js' },
      { toolUseID: 'external-tool' },
    );

    expect(
      state.emitted.find(
        event =>
          event.type === 'tool-call' && event.toolCallId === 'external-tool',
      ),
    ).toEqual({
      type: 'tool-call',
      toolCallId: 'external-tool',
      toolName: 'mcp__context7__query-docs',
      nativeName: 'mcp__context7__query-docs',
      input: '{"libraryId":"/vercel/next.js"}',
      providerExecuted: true,
      dynamic: true,
    });
  });

  test('routes questions through a PreToolUse hook in allow-all mode', async () => {
    const nativeInput = {
      questions: [
        {
          question: 'Which framework?',
          header: 'Framework',
          options: [
            { label: 'React', description: 'React' },
            { label: 'Vue', description: 'Vue' },
          ],
          multiSelect: false,
        },
      ],
    };
    state.requestToolResult = async () => ({
      output: {
        action: 'answered',
        answers: {
          'question-1': { optionIds: ['option-2'] },
        },
      },
    });

    await import('./index');

    const hooks = state.queryArgs[0]?.options.hooks as {
      PreToolUse: Array<{
        matcher: string;
        hooks: Array<
          (
            input: Record<string, unknown>,
            toolUseID: string,
            options: { signal: AbortSignal },
          ) => Promise<unknown>
        >;
      }>;
    };
    const questionHook = hooks.PreToolUse[0];
    expect(state.queryArgs[0]?.options).toHaveProperty('canUseTool');
    const result = await questionHook.hooks[0](
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'AskUserQuestion',
        tool_input: nativeInput,
        tool_use_id: 'question-tool',
      },
      'question-tool',
      { signal: new AbortController().signal },
    );

    expect(questionHook.matcher).toBe('AskUserQuestion');
    expect(state.emitted.filter(event => event.type === 'tool-call'))
      .toMatchInlineSnapshot(`
      [
        {
          "input": "{"allowPartialAnswers":true,"questions":[{"id":"question-1","question":"Which framework?","header":"Framework","options":[{"id":"option-1","label":"React","description":"React"},{"id":"option-2","label":"Vue","description":"Vue"}],"allowMultiple":false,"allowFreeForm":true}]}",
          "nativeName": "AskUserQuestion",
          "providerExecuted": false,
          "providerMetadata": {
            "claude-code": {
              "nativeRequest": {
                "questions": [
                  {
                    "header": "Framework",
                    "multiSelect": false,
                    "options": [
                      {
                        "description": "React",
                        "label": "React",
                      },
                      {
                        "description": "Vue",
                        "label": "Vue",
                      },
                    ],
                    "question": "Which framework?",
                  },
                ],
              },
            },
          },
          "toolCallId": "question-tool",
          "toolName": "askUserQuestions",
          "type": "tool-call",
        },
      ]
    `);
    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: {
          ...nativeInput,
          answers: { 'Which framework?': 'Vue' },
        },
      },
    });
  });

  test('uses callback metadata to correlate identical parallel host tool calls', async () => {
    state.start = {
      ...state.start,
      tools: [
        {
          name: 'weather',
          description: 'Get the weather',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              unit: { type: 'string' },
            },
            required: ['city', 'unit'],
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
            partial_json: '{"unit":"C","city":"Chicago"}',
          },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'host-tool-2',
            name: 'mcp__harness-tools__weather',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"unit":"C","city":"Chicago"}',
          },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 1 },
      },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'host-tool-1',
              name: 'mcp__harness-tools__weather',
              input: { city: 'Chicago', unit: 'C' },
            },
            {
              type: 'tool_use',
              id: 'host-tool-2',
              name: 'mcp__harness-tools__weather',
              input: { city: 'Chicago', unit: 'C' },
            },
          ],
        },
      },
      {
        type: 'invoke-host-tools',
        calls: [
          {
            toolName: 'weather',
            toolCallId: 'host-tool-2',
            input: { city: 'Chicago', unit: 'C' },
          },
          {
            toolName: 'weather',
            toolCallId: 'host-tool-1',
            input: { city: 'Chicago', unit: 'C' },
          },
        ],
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
            {
              type: 'tool_result',
              tool_use_id: 'host-tool-2',
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

    expect(state.emitted.filter(event => event.type === 'tool-call')).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'host-tool-2',
        toolName: 'weather',
        input: '{"city":"Chicago","unit":"C"}',
        providerExecuted: false,
      },
      {
        type: 'tool-call',
        toolCallId: 'host-tool-1',
        toolName: 'weather',
        input: '{"city":"Chicago","unit":"C"}',
        providerExecuted: false,
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

  test('a host abort interrupts the query gracefully, stays quiet, and disposes it', async () => {
    const turnAbort = new AbortController();
    state.turnAbortController = turnAbort;
    const emitError = vi.fn();
    state.emitError = emitError;

    // A query that stays in flight until `interrupt()` is called, then settles
    // with the error-shaped result an interrupted Claude query reports.
    let releaseInterrupt!: () => void;
    const interrupted = new Promise<void>(resolve => {
      releaseInterrupt = resolve;
    });
    const generator = (async function* () {
      await interrupted;
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['Interrupted by user'],
      };
    })();
    const interrupt = vi.fn(async () => releaseInterrupt());
    const disposed = vi.fn();
    const originalReturn = generator.return.bind(generator);
    generator.return = ((value?: unknown) => {
      disposed();
      return originalReturn(value as never);
    }) as typeof generator.return;

    state.createQuery = () => {
      // Abort only once the turn holds the query, so the graceful
      // `interrupt()` path is taken rather than the pre-query hard abort.
      queueMicrotask(() => turnAbort.abort());
      return Object.assign(generator, { interrupt });
    };

    await import('./index');

    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(emitError).not.toHaveBeenCalled();
    expect(disposed).toHaveBeenCalled();
  });

  test('falls back to a hard abort when interrupt() rejects, staying quiet', async () => {
    const turnAbort = new AbortController();
    state.turnAbortController = turnAbort;
    const emitError = vi.fn();
    state.emitError = emitError;

    // A query whose `interrupt()` rejects; the hard-abort fallback fires the
    // query's abort signal, on which the SDK iteration throws — exactly what
    // the real CLI does when its process is killed mid-turn.
    const interrupt = vi.fn(async () => {
      throw new Error('interrupt is not supported');
    });
    const disposed = vi.fn();
    state.createQuery = args => {
      const abortSignal = (args.options as { abortSignal: AbortSignal })
        .abortSignal;
      const generator = (async function* () {
        await new Promise<void>(resolve => {
          if (abortSignal.aborted) return resolve();
          abortSignal.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
        // The promise above settles only on abort, so the throw always fires.
        if (abortSignal.aborted) {
          throw Object.assign(new Error('This operation was aborted'), {
            name: 'AbortError',
          });
        }
        yield undefined as never;
      })();
      const originalReturn = generator.return.bind(generator);
      generator.return = ((value?: unknown) => {
        disposed();
        return originalReturn(value as never);
      }) as typeof generator.return;
      queueMicrotask(() => turnAbort.abort());
      return Object.assign(generator, { interrupt });
    };

    await import('./index');

    // The graceful path was attempted, the hard abort took over…
    expect(interrupt).toHaveBeenCalledTimes(1);
    // …and neither the rejected interrupt nor the aborted iteration was
    // reported as a turn failure: the stop is the host's own.
    expect(emitError).not.toHaveBeenCalled();
    expect(disposed).toHaveBeenCalled();
  });
  test('reports a result flagged `is_error` as a terminal error, even though its subtype is `success`', async () => {
    const emitError = vi.fn();
    state.emitError = emitError;
    // What the CLI actually sends when the provider rejects the request: the
    // `success` subtype, `is_error: true`, and the message in `result`.
    state.messages = [
      {
        type: 'result',
        subtype: 'success',
        is_error: true,
        api_error_status: 400,
        result: 'API Error: 400 the request was rejected',
      },
    ];

    await import('./index');

    expect(emitError).toHaveBeenCalledWith({
      error: 'API Error: 400 the request was rejected',
      message: 'claude-code terminal error',
    });
    // The turn must not also settle as a normal finish: that is what made a
    // hard rejection look like an agent that simply returned nothing.
    expect(state.emitted).not.toContainEqual(
      expect.objectContaining({ type: 'finish' }),
    );
  });

  test('names the HTTP status when an errored result carries no message', async () => {
    const emitError = vi.fn();
    state.emitError = emitError;
    state.messages = [
      {
        type: 'result',
        subtype: 'success',
        is_error: true,
        api_error_status: 529,
        result: '   ',
      },
    ];

    await import('./index');

    expect(emitError).toHaveBeenCalledWith({
      error: 'Claude Code reported an API error (HTTP 529)',
      message: 'claude-code terminal error',
    });
  });

  test('still finishes normally when a `success` result is not flagged as an error', async () => {
    const emitError = vi.fn();
    state.emitError = emitError;
    state.messages = [
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'done',
      },
    ];

    await import('./index');

    expect(emitError).not.toHaveBeenCalled();
    expect(state.emitted).toContainEqual(
      expect.objectContaining({ type: 'finish' }),
    );
  });
});
