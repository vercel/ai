import { afterEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
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

vi.mock('./opencode-path', () => ({
  prependOpenCodeBinToPath: vi.fn(),
}));

describe('OpenCode bridge turn settlement', () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv.length = 0;
    for (const arg of originalArgv) process.argv.push(arg);
    vi.resetModules();
  });

  it('settles when OpenCode emits session.next.step.failed', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const emitError = vi.fn();
    let closed = false;
    const iteratorWaiters: Array<(result: IteratorResult<never>) => void> = [];
    const userMessages = {
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
    process.argv.length = 0;
    for (const arg of [
      process.execPath,
      'opencode-bridge',
      '--workdir',
      '/tmp/opencode-bridge-test',
      '--bridge-state-dir',
      '/tmp/opencode-bridge-test-state',
      '--bootstrap-dir',
      '/tmp/opencode-bridge-test-bootstrap',
    ]) {
      process.argv.push(arg);
    }

    await import('./index');

    expect(userMessages.close).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'model step failed' }),
    );
    expect(emitError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'OpenCode turn failed' }),
    );
    expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  });
});
