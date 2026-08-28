import { afterEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
}));

const permissionReplyMock = vi.hoisted(() => vi.fn());
const createOpencodeServerMock = vi.hoisted(() =>
  vi.fn(async (_options: Record<string, unknown>) => ({
    url: 'http://127.0.0.1:4096',
    close: vi.fn(),
  })),
);

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
  createOpencodeServer: createOpencodeServerMock,
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
    createOpencodeServerMock.mockClear();
    relayMock.authorizeToolCall.mockReset();
    permissionReplyMock.mockReset();
  });

  it('disables the interactive question tool', async () => {
    const userMessages = createUserMessages();
    bridgeMock.start = {
      type: 'start',
      operation: 'prompt',
      prompt: 'Start.',
    };
    bridgeMock.turn = {
      emit: vi.fn(),
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

    expect(createOpencodeServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          permission: expect.objectContaining({ question: 'deny' }),
        }),
      }),
    );
  });

  it('settles when OpenCode emits session.next.step.failed', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const emitError = vi.fn();
    const userMessages = createUserMessages();
    const openCodeConfig = {
      agent: {
        general: {
          model: 'openai/gpt-5.4-mini',
          permission: { bash: 'allow', external_directory: 'allow' },
          tools: { bash: true, edit: true },
        },
      },
      mode: {
        plan: {
          model: 'openai/gpt-5.4-mini',
          permission: { edit: 'allow' },
          tools: { edit: true },
        },
      },
      share: 'manual',
    };
    bridgeMock.start = {
      type: 'start',
      operation: 'prompt',
      prompt: 'Start.',
      model: 'openai/gpt-5.6-sol',
      openCodeConfig,
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

    const serverConfig = createOpencodeServerMock.mock.calls[0]?.[0]
      .config as Record<string, unknown>;
    expect(serverConfig).toMatchObject({
      agent: { general: { model: 'openai/gpt-5.4-mini' } },
      mode: { plan: { model: 'openai/gpt-5.4-mini' } },
      model: 'openai/gpt-5.6-sol',
      share: 'disabled',
    });
    expect(serverConfig.agent).toEqual({
      general: { model: 'openai/gpt-5.4-mini' },
    });
    expect(serverConfig.mode).toEqual({
      plan: { model: 'openai/gpt-5.4-mini' },
    });
    expect(openCodeConfig).toEqual({
      agent: {
        general: {
          model: 'openai/gpt-5.4-mini',
          permission: { bash: 'allow', external_directory: 'allow' },
          tools: { bash: true, edit: true },
        },
      },
      mode: {
        plan: {
          model: 'openai/gpt-5.4-mini',
          permission: { edit: 'allow' },
          tools: { edit: true },
        },
      },
      share: 'manual',
    });
    expect(userMessages.close).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'model step failed' }),
    );
    expect(emitError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'OpenCode turn failed' }),
    );
    expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  });

  it('settles a host-aborted turn once the next event arrives', async () => {
    // The shared bridge runtime serializes turns: a replacement `start`
    // waits (bounded) for the aborted turn's `onStart` to settle. OpenCode
    // observes its abort signal at the top of the event loop, so any event
    // after the abort — a heartbeat is enough — must settle the turn; it
    // must not keep waiting for the turn's own completion events.
    const emitted: Array<Record<string, unknown>> = [];
    const emitError = vi.fn();
    const userMessages = createUserMessages();
    const abort = new AbortController();
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
      abortSignal: abort.signal,
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
        // The turn is in flight when the host aborts.
        promptAsync: vi.fn(async () => {
          queueMicrotask(() => abort.abort());
          return { data: {} };
        }),
      },
      event: {
        subscribe: vi.fn(async () => ({
          stream: {
            async *[Symbol.asyncIterator]() {
              // No completion events — the model is mid-work. Deliver one
              // heartbeat after the abort; nothing else, ever.
              await new Promise<void>(resolve => {
                if (abort.signal.aborted) return resolve();
                abort.signal.addEventListener('abort', () => resolve(), {
                  once: true,
                });
              });
              yield {
                type: 'session.updated',
                properties: { sessionID: 'session-1' },
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

    // Resolves only once `onStart` settles — the very promise the shared
    // runtime's turn fence waits on before starting a replacement turn.
    await import('./index');

    expect(emitError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'OpenCode turn failed' }),
    );
    expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  });

  it('authorizes host tools for task-linked subagents only', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const userMessages = createUserMessages();
    bridgeMock.start = {
      type: 'start',
      operation: 'prompt',
      prompt: 'Delegate this task.',
      tools: [{ name: 'lookup' }],
      responseFormat: { type: 'json' },
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
                type: 'message.updated',
                properties: {
                  info: {
                    id: 'child-message',
                    sessionID: 'child-session',
                    role: 'assistant',
                    structured: { leaked: true },
                  },
                },
              };
              yield {
                type: 'session.updated',
                properties: {
                  info: {
                    id: 'child-session',
                    summary: {
                      additions: 99,
                      deletions: 99,
                      files: 99,
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
                    id: 'parent-message',
                    sessionID: 'parent-session',
                    role: 'assistant',
                    structured: { result: 'parent' },
                  },
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
      type: 'text-delta',
      id: 'parent-message',
      delta: JSON.stringify({ result: 'parent' }),
    });
    expect(emitted).not.toContainEqual(
      expect.objectContaining({ delta: JSON.stringify({ leaked: true }) }),
    );
    expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  });
});
