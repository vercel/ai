import type { startAuthorizedToolRelay } from './tool-relay';
import { afterEach, expect, test, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
}));

const permissionReplyMock = vi.hoisted(() => vi.fn());

const relayState = vi.hoisted(() => ({
  relay: undefined as
    | {
        port: number;
        close(): void;
      }
    | undefined,
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: vi.fn(
    async (options: {
      onStart(start: unknown, turn: unknown): Promise<void>;
    }) => {
      await options.onStart(bridgeMock.start, bridgeMock.turn);
      return { close: vi.fn() };
    },
  ),
}));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: vi.fn(async () => ({
    url: 'http://127.0.0.1:4096',
    close: vi.fn(),
  })),
  createOpencodeClient: vi.fn(() => sdkMock.client),
}));

vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));

vi.mock('./opencode-path', () => ({
  prependOpenCodeBinToPath: vi.fn(),
}));

vi.mock('./tool-relay', async importOriginal => {
  const actual = await importOriginal<{
    startAuthorizedToolRelay: typeof startAuthorizedToolRelay;
  }>();
  const { ToolRelayAuthorizer } = await import('./tool-relay-auth');

  return {
    ...actual,
    startAuthorizedToolRelay: async (
      options: Parameters<typeof actual.startAuthorizedToolRelay>[0],
    ) => {
      const relay = await actual.startAuthorizedToolRelay({
        ...options,
        authorizer: new ToolRelayAuthorizer({ ttlMs: 100 }),
      });
      relayState.relay = relay;
      return relay;
    },
  };
});

const originalArgv = [...process.argv];

afterEach(() => {
  relayState.relay?.close();
  relayState.relay = undefined;
  process.argv.length = 0;
  process.argv.push(...originalArgv);
  vi.resetModules();
});

test('task-linked child host tools execute without exposing child events', async () => {
  const emitted: Array<Record<string, unknown>> = [];
  const requestToolResult = vi.fn(async () => ({
    output: { value: 'host-tool-result' },
  }));
  const userMessages = createUserMessages();
  let childRelayResponse:
    | { status: number; body: Record<string, unknown> }
    | undefined;
  let unrelatedRelayResponse:
    | { status: number; body: Record<string, unknown> }
    | undefined;

  bridgeMock.start = {
    type: 'start',
    operation: 'prompt',
    prompt: 'Delegate this task.',
    tools: [{ name: 'lookup' }],
  };
  bridgeMock.turn = {
    emit: (event: Record<string, unknown>) => emitted.push(event),
    requestToolResult,
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
            yield taskSessionEvent();
            yield childPermissionEvent();
            yield childTextEvent('CHILD_OUTPUT_MUST_NOT_LEAK');
            yield hostToolEvent({
              sessionID: 'unrelated-session',
              callID: 'unrelated-call',
              input: { query: 'unrelated' },
            });

            const unrelatedRequest = requestRelay({
              requestId: 'unrelated-request',
              input: { query: 'unrelated' },
            });

            yield hostToolEvent({
              sessionID: 'child-session',
              callID: 'child-call',
              input: { query: 'authorized' },
            });

            const childRequest = requestRelay({
              requestId: 'child-request',
              input: { query: 'authorized' },
            });

            [unrelatedRelayResponse, childRelayResponse] = await Promise.all([
              unrelatedRequest,
              childRequest,
            ]);

            yield {
              type: 'session.status',
              properties: {
                sessionID: 'child-session',
                status: { type: 'busy' },
              },
            };
            yield {
              type: 'session.status',
              properties: {
                sessionID: 'child-session',
                status: { type: 'idle' },
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

  try {
    await import('./index');
  } finally {
    relayState.relay?.close();
    relayState.relay = undefined;
  }

  if (
    childRelayResponse?.status === 401 &&
    childRelayResponse.body.error === 'unauthorized tool relay request'
  ) {
    throw new Error(
      'ISSUE_19646: task-linked child host tool did not execute because relay returned 401 unauthorized tool relay request',
    );
  }

  expect(childRelayResponse).toEqual({
    status: 200,
    body: { result: { value: 'host-tool-result' } },
  });
  expect(requestToolResult).toHaveBeenCalledOnce();
  expect(unrelatedRelayResponse).toEqual({
    status: 401,
    body: { error: 'unauthorized tool relay request' },
  });
  expect(permissionReplyMock).toHaveBeenCalledWith({
    sessionID: 'child-session',
    requestID: 'child-permission',
    reply: 'always',
  });
  expect(JSON.stringify(emitted)).not.toContain('CHILD_OUTPUT_MUST_NOT_LEAK');
  expect(emitted).toContainEqual(
    expect.objectContaining({ type: 'finish-step' }),
  );
});

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

function taskSessionEvent() {
  return {
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
}

function childPermissionEvent() {
  return {
    type: 'permission.v2.asked',
    properties: {
      sessionID: 'child-session',
      id: 'child-permission',
      action: 'webfetch',
      resources: [],
      source: { callID: 'child-webfetch-call' },
    },
  };
}

function childTextEvent(text: string) {
  return {
    type: 'session.next.text.delta',
    properties: {
      sessionID: 'child-session',
      textID: 'child-text',
      delta: text,
    },
  };
}

function hostToolEvent({
  sessionID,
  callID,
  input,
}: {
  sessionID: string;
  callID: string;
  input: Record<string, unknown>;
}) {
  return {
    type: 'message.part.updated',
    properties: {
      part: {
        type: 'tool',
        sessionID,
        callID,
        tool: 'lookup',
        state: {
          status: 'running',
          input,
        },
      },
    },
  };
}

async function requestRelay({
  requestId,
  input,
}: {
  requestId: string;
  input: Record<string, unknown>;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const relay = relayState.relay;
  if (!relay) throw new Error('relay was not started');

  const response = await fetch(`http://127.0.0.1:${relay.port}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      toolName: 'lookup',
      input,
    }),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}
