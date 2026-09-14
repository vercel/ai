import { describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
  onStart: undefined as
    | ((start: unknown, turn: unknown) => Promise<void>)
    | undefined,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
}));

const serverMock = vi.hoisted(() => {
  const servers: Array<{
    url: string;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const create = vi.fn(async (_options: Record<string, unknown>) => {
    const server = {
      url: `http://127.0.0.1:${4096 + servers.length}`,
      close: vi.fn(),
    };
    servers.push(server);
    return server;
  });
  return { create, servers };
});

const relayMock = vi.hoisted(() => ({
  authorizeToolCall: vi.fn(),
  close: vi.fn(),
  port: 4097,
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: vi.fn(async (options: unknown) => {
    const bridge = options as {
      onStart(start: unknown, turn: unknown): Promise<void>;
    };
    bridgeMock.onStart = bridge.onStart;
    await bridge.onStart(bridgeMock.start, bridgeMock.turn);
    return { close: vi.fn() };
  }),
}));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: serverMock.create,
  createOpencodeClient: vi.fn(() => sdkMock.client),
}));

vi.mock('./tool-relay', () => ({
  startAuthorizedToolRelay: vi.fn(async () => relayMock),
}));

vi.mock('./opencode-path', () => ({
  prependOpenCodeBinToPath: vi.fn(),
}));

function createUserMessages() {
  let closed = false;
  const iteratorWaiters: Array<(result: IteratorResult<never>) => void> = [];
  return {
    pendingCount: 0,
    close: vi.fn(() => {
      closed = true;
      while (iteratorWaiters.length > 0) {
        iteratorWaiters.shift()!({ done: true, value: undefined });
      }
    }),
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          closed
            ? Promise.resolve({ done: true as const, value: undefined })
            : new Promise<IteratorResult<never>>(resolve => {
                iteratorWaiters.push(resolve);
              }),
      };
    },
  };
}

function setBridgeArgv() {
  process.argv.length = 0;
  process.argv.push(
    process.execPath,
    'opencode-bridge',
    '--workdir',
    '/tmp/opencode-bridge-issue-20749',
    '--bridge-state-dir',
    '/tmp/opencode-bridge-issue-20749-state',
    '--bootstrap-dir',
    '/tmp/opencode-bridge-issue-20749-bootstrap',
  );
}

describe('issue #20749', () => {
  it('refreshes changed or removed native config while preserving the warm session and retryability', async () => {
    const client = {
      mcp: { status: vi.fn(async () => ({ data: {} })) },
      session: {
        create: vi.fn(async () => ({ data: { id: 'session-1' } })),
        get: vi.fn(async () => ({ data: {} })),
        messages: vi.fn(async () => ({ data: [] })),
        promptAsync: vi.fn(async (_request: unknown) => ({ data: {} })),
      },
      event: {
        subscribe: vi.fn(async () => ({
          stream: {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'session.status',
                properties: {
                  sessionID: 'session-1',
                  status: { type: 'busy' },
                },
              };
              yield {
                type: 'session.next.step.ended',
                properties: {
                  sessionID: 'session-1',
                  finish: 'stop',
                  tokens: {
                    input: 1,
                    output: 1,
                    reasoning: 0,
                    cache: { read: 0, write: 0 },
                  },
                },
              };
              yield {
                type: 'session.status',
                properties: {
                  sessionID: 'session-1',
                  status: { type: 'idle' },
                },
              };
            },
          },
        })),
      },
      v2: {
        session: { context: vi.fn(async () => ({ data: [] })) },
      },
    };
    const turn = () => ({
      emit: vi.fn(),
      requestToolResult: vi.fn(),
      requestToolApproval: vi.fn(),
      experimental_userMessages: createUserMessages(),
      abortSignal: new AbortController().signal,
      firstTurn: false,
      bridgeLog: vi.fn(),
      emitWarning: vi.fn(),
      emitError: vi.fn(),
    });
    const start = (prompt: string | undefined) => ({
      type: 'start',
      operation: 'prompt',
      prompt: 'Continue.',
      tools: [{ name: 'lookup' }],
      openCodeConfig:
        prompt === undefined ? undefined : { agent: { build: { prompt } } },
    });

    sdkMock.client = client;
    bridgeMock.start = start('Prompt A');
    bridgeMock.turn = turn();
    setBridgeArgv();

    await import('./index');

    const firstServer = serverMock.servers[0];
    await bridgeMock.onStart!(start('Prompt A'), turn());
    const countAfterIdenticalConfig = serverMock.create.mock.calls.length;
    const firstServerCloseCountAfterIdenticalConfig =
      firstServer?.close.mock.calls.length;

    await bridgeMock.onStart!(start('Prompt B'), turn());
    const countAfterChangedConfig = serverMock.create.mock.calls.length;
    const changedConfig = serverMock.create.mock.calls[1]?.[0]?.config;
    const firstServerCloseCountAfterChangedConfig =
      firstServer?.close.mock.calls.length;
    const relayCloseCountAfterChangedConfig = relayMock.close.mock.calls.length;
    const promptSessionIdsAfterChangedConfig =
      client.session.promptAsync.mock.calls.map(
        ([request]) => (request as { sessionID?: string }).sessionID,
      );

    serverMock.create.mockRejectedValueOnce(new Error('startup failed'));
    const failedTurn = turn();
    await bridgeMock.onStart!(start('Prompt C'), failedTurn);
    const promptCountAfterFailedRefresh =
      client.session.promptAsync.mock.calls.length;
    const secondServer = serverMock.servers[1];
    const secondServerCloseCountAfterFailedRefresh =
      secondServer?.close.mock.calls.length;

    const retryTurn = turn();
    await bridgeMock.onStart!(start('Prompt C'), retryTurn);
    const countAfterRetry = serverMock.create.mock.calls.length;
    const promptCountAfterRetry = client.session.promptAsync.mock.calls.length;
    const secondServerCloseCountAfterRetry =
      secondServer?.close.mock.calls.length;

    await bridgeMock.onStart!(start(undefined), turn());
    const countAfterRemovingConfig = serverMock.create.mock.calls.length;
    const configAfterRemovingOverride =
      serverMock.create.mock.calls[4]?.[0]?.config;

    const problems: string[] = [];
    const check = (condition: boolean, problem: string) => {
      if (!condition) problems.push(problem);
    };

    check(
      countAfterIdenticalConfig === 1,
      `identical Prompt A created ${countAfterIdenticalConfig} servers instead of reusing one`,
    );
    check(
      firstServerCloseCountAfterIdenticalConfig === 0,
      'identical Prompt A closed the warm server',
    );
    check(
      countAfterChangedConfig === 2,
      `Prompt B left the server creation count at ${countAfterChangedConfig} instead of refreshing it`,
    );
    check(
      JSON.stringify(changedConfig)?.includes('"prompt":"Prompt B"') === true,
      'Prompt B was not applied to the replacement native server',
    );
    check(
      firstServerCloseCountAfterChangedConfig === 1,
      'the Prompt A server was not closed exactly once after Prompt B',
    );
    check(
      relayCloseCountAfterChangedConfig === 1,
      'the Prompt A tool relay was not closed exactly once after Prompt B',
    );
    check(
      client.session.create.mock.calls.length === 1,
      'refreshing configuration created a different OpenCode session',
    );
    check(
      promptSessionIdsAfterChangedConfig.length === 3 &&
        promptSessionIdsAfterChangedConfig.every(
          sessionId => sessionId === 'session-1',
        ),
      'the A, A, and B turns did not all preserve session-1',
    );
    check(
      failedTurn.emitError.mock.calls.some(
        ([value]) =>
          (value as { error?: Error }).error?.message === 'startup failed',
      ),
      'the Prompt C replacement initialization was not attempted and reported',
    );
    check(
      promptCountAfterFailedRefresh === 3,
      'the failed Prompt C refresh incorrectly submitted a prompt',
    );
    check(secondServer != null, 'the Prompt B replacement server was missing');
    if (secondServer != null) {
      check(
        secondServerCloseCountAfterFailedRefresh === 1,
        'the Prompt B server was not closed exactly once for the failed Prompt C refresh',
      );
    }
    check(
      retryTurn.emitError.mock.calls.length === 0,
      'the Prompt C retry did not recover',
    );
    check(
      countAfterRetry === 4,
      `the Prompt C retry produced ${countAfterRetry} total initialization attempts instead of four`,
    );
    check(
      promptCountAfterRetry === 4,
      'the successful Prompt C retry did not submit the next session-1 prompt',
    );
    if (secondServer != null) {
      check(
        secondServerCloseCountAfterRetry === 1,
        'the Prompt B server was closed more than once during retry',
      );
    }
    check(
      countAfterRemovingConfig === 5,
      `removing openCodeConfig left the server creation count at ${countAfterRemovingConfig} instead of clearing the override`,
    );
    check(
      configAfterRemovingOverride != null &&
        !Object.prototype.hasOwnProperty.call(
          configAfterRemovingOverride,
          'agent',
        ),
      'removing openCodeConfig left the prior agent prompt override active',
    );
    check(
      client.session.create.mock.calls.length === 1 &&
        client.session.promptAsync.mock.calls.every(
          ([request]) =>
            (request as { sessionID?: string }).sessionID === 'session-1',
        ),
      'a refresh or retry replaced session-1 and lost its history',
    );
    check(
      serverMock.servers.every(server => server.close.mock.calls.length <= 1),
      'a previous native server was closed more than once',
    );

    if (problems.length > 0) {
      throw new Error(
        [
          'ISSUE_20749: warm OpenCode bridge did not apply changed openCodeConfig while preserving session-1',
          ...problems.map(problem => `- ${problem}`),
        ].join('\n'),
      );
    }

    expect(problems).toEqual([]);
  });
});
