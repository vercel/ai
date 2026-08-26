import { afterEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
}));

const permissionReplyMock = vi.hoisted(() => vi.fn());

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
    await bridge.onStart(bridgeMock.start, bridgeMock.turn);
    return { close: vi.fn() };
  }),
}));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: vi.fn(async () => ({
    url: 'http://127.0.0.1:4096',
    close: vi.fn(),
  })),
  createOpencodeClient: vi.fn(() => sdkMock.client),
}));

vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));

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
    '/tmp/opencode-bridge-test',
    '--bridge-state-dir',
    '/tmp/opencode-bridge-test-state',
    '--bootstrap-dir',
    '/tmp/opencode-bridge-test-bootstrap',
  );
}

describe('OpenCode bridge turn settlement', () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv.length = 0;
    for (const arg of originalArgv) process.argv.push(arg);
    vi.resetModules();
    relayMock.authorizeToolCall.mockReset();
    permissionReplyMock.mockReset();
  });

  it('settles when OpenCode emits session.next.step.failed', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const emitError = vi.fn();
    const userMessages = createUserMessages();
    bridgeMock.start = {
      type: 'start',
      operation: 'prompt',
      prompt: 'Start.',
    };
    bridgeMock.turn = {
      emit: (event: Record<string, unknown>) => emitted.push(event),
      requestToolResult: vi.fn(),
      requestToolApproval: vi.fn(),
      experimental_userMessages: userMessages,
      abortSignal: new AbortController().signal,
      firstTurn: true,
      bridgeLog: vi.fn(),
      emitWarning: vi.fn(),
      emitError,
    };
    sdkMock.client = {
      mcp: { status: vi.fn(async () => ({ data: {} })) },
      session: {
        create: vi.fn(async () => ({ data: { id: 'session-1' } })),
        get: vi.fn(async () => ({ data: {} })),
        messages: vi.fn(async () => ({ data: [] })),
        promptAsync: vi.fn(async () => ({ data: {} })),
      },
      event: {
        subscribe: vi.fn(async () => ({
          stream: {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'session.next.step.failed',
                properties: {
                  sessionID: 'session-1',
                  error: 'model step failed',
                },
              };
            },
          },
        })),
      },
      v2: {
        session: {
          context: vi.fn(async () => ({ data: [] })),
        },
      },
    };
    setBridgeArgv();

    await import('./index');

    expect(userMessages.close).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'model step failed' }),
    );
    expect(emitError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'OpenCode turn failed' }),
    );
    expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  });

  it('authorizes tools and reports usage for task-linked subagents', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const userMessages = createUserMessages();
    bridgeMock.start = {
      type: 'start',
      operation: 'prompt',
      prompt: 'Delegate this task.',
      tools: [{ name: 'lookup' }],
    };
    bridgeMock.turn = {
      emit: (event: Record<string, unknown>) => emitted.push(event),
      requestToolResult: vi.fn(),
      requestToolApproval: vi.fn(),
      experimental_userMessages: userMessages,
      abortSignal: new AbortController().signal,
      firstTurn: true,
      bridgeLog: vi.fn(),
      emitWarning: vi.fn(),
      emitError: vi.fn(),
    };
    sdkMock.client = {
      mcp: { status: vi.fn(async () => ({ data: {} })) },
      session: {
        create: vi.fn(async () => ({ data: { id: 'parent-session' } })),
        get: vi.fn(async () => ({ data: {} })),
        messages: vi.fn(async () => ({ data: [] })),
        promptAsync: vi.fn(async () => ({ data: {} })),
      },
      event: {
        subscribe: vi.fn(async () => ({
          stream: {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'message.part.updated',
                properties: {
                  part: {
                    type: 'tool',
                    sessionID: 'parent-session',
                    callID: 'task-call',
                    tool: 'task',
                    state: {
                      status: 'running',
                      input: { prompt: 'Research this.' },
                      metadata: {
                        parentSessionId: 'parent-session',
                        sessionId: 'child-session',
                      },
                    },
                  },
                },
              };
              yield {
                type: 'permission.v2.asked',
                properties: {
                  sessionID: 'child-session',
                  id: 'child-permission',
                  action: 'webfetch',
                  resources: [],
                  source: { callID: 'child-webfetch-call' },
                },
              };
              yield {
                type: 'message.part.updated',
                properties: {
                  part: {
                    type: 'tool',
                    sessionID: 'unrelated-session',
                    callID: 'unrelated-call',
                    tool: 'lookup',
                    state: {
                      status: 'running',
                      input: { query: 'unrelated' },
                    },
                  },
                },
              };
              yield {
                type: 'message.part.updated',
                properties: {
                  part: {
                    type: 'tool',
                    sessionID: 'child-session',
                    callID: 'child-call',
                    tool: 'lookup',
                    state: {
                      status: 'running',
                      input: { query: 'authorized' },
                    },
                  },
                },
              };
              yield {
                type: 'message.updated',
                properties: {
                  info: {
                    id: 'child-message',
                    sessionID: 'child-session',
                    role: 'assistant',
                    providerID: 'openai',
                    modelID: 'gpt-5.6-sol',
                  },
                },
              };
              yield {
                type: 'message.part.updated',
                properties: {
                  part: {
                    id: 'child-step-finish',
                    messageID: 'child-message',
                    sessionID: 'child-session',
                    type: 'step-finish',
                    reason: 'stop',
                    cost: 0.0042,
                    tokens: {
                      input: 3,
                      output: 5,
                      reasoning: 1,
                      cache: { read: 10, write: 2 },
                    },
                  },
                },
              };
              yield {
                type: 'session.next.step.ended',
                properties: {
                  sessionID: 'parent-session',
                  finish: 'stop',
                  tokens: {
                    input: 1,
                    output: 1,
                    reasoning: 0,
                    cache: { read: 0, write: 0 },
                  },
                  cost: 0,
                },
              };
              yield {
                type: 'session.status',
                properties: {
                  sessionID: 'parent-session',
                  status: { type: 'busy' },
                },
              };
              yield {
                type: 'session.status',
                properties: {
                  sessionID: 'parent-session',
                  status: { type: 'idle' },
                },
              };
            },
          },
        })),
      },
      v2: {
        session: {
          context: vi.fn(async () => ({ data: [] })),
          permission: { reply: permissionReplyMock },
        },
      },
    };
    setBridgeArgv();

    await import('./index');

    expect(relayMock.authorizeToolCall).toHaveBeenCalledOnce();
    expect(relayMock.authorizeToolCall).toHaveBeenCalledWith({
      toolName: 'lookup',
      input: { query: 'authorized' },
    });
    expect(permissionReplyMock).toHaveBeenCalledWith({
      sessionID: 'child-session',
      requestID: 'child-permission',
      reply: 'always',
    });
    expect(emitted).toContainEqual({
      type: 'raw',
      rawValue: {
        type: 'opencode.subagent-usage',
        version: 1,
        sessionId: 'child-session',
        stepId: 'child-message',
        modelId: 'openai/gpt-5.6-sol',
        usage: {
          inputTokens: {
            total: 3,
            noCache: 0,
            cacheRead: 10,
            cacheWrite: 2,
          },
          outputTokens: { total: 6, text: 5, reasoning: 1 },
        },
        cost: 0.0042,
      },
    });
    expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  });
});
