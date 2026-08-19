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
  emitted: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  queryArgs: [] as QueryArgs[],
  start: {} as Record<string, unknown>,
  onStop: undefined as (() => unknown) | undefined,
  firstTurn: true,
  originalArgv: [] as string[],
  originalEnv: {} as Record<string, string | undefined>,
  steering: false,
  acceptedUserMessages: [] as string[],
  queryInputs: [] as unknown[],
  /** Per-test query factory; falls back to the `state.messages` generator. */
  createQuery: undefined as ((args: QueryArgs) => unknown) | undefined,
  /** Per-test turn abort controller; defaults to a fresh, never-aborted one. */
  turnAbortController: undefined as AbortController | undefined,
  /** Per-test error sink; defaults to a no-op. */
  emitError: undefined as ((input: unknown) => void) | undefined,
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
    onStop,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
    onStop?: () => unknown;
  }) => {
    state.onStop = onStop;
    await onStart(state.start, {
      abortSignal: (state.turnAbortController ?? new AbortController()).signal,
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
      firstTurn: state.firstTurn,
      emit: (event: Record<string, unknown>) => state.emitted.push(event),
      emitWarning: () => {},
      emitError: (input: unknown) => state.emitError?.(input),
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
    state.createQuery = undefined;
    state.turnAbortController = undefined;
    state.emitError = undefined;
    state.onStop = undefined;
    state.firstTurn = true;
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
});
