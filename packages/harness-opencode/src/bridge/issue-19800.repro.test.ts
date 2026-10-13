import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
}));

const createOpencodeServerMock = vi.hoisted(() =>
  vi.fn(async () => ({
    url: 'http://127.0.0.1:4096',
    close: vi.fn(),
  })),
);

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
  createOpencodeServer: createOpencodeServerMock,
  createOpencodeClient: vi.fn(() => sdkMock.client),
}));

vi.mock('./opencode-path', () => ({
  prependOpenCodeBinToPath: vi.fn(),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createUserMessages() {
  let closed = false;
  const waiters: Array<(result: IteratorResult<never>) => void> = [];
  return {
    pendingCount: 0,
    close: vi.fn(() => {
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()!({ done: true, value: undefined });
      }
    }),
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          closed
            ? Promise.resolve({ done: true as const, value: undefined })
            : new Promise<IteratorResult<never>>(resolve => {
                waiters.push(resolve);
              }),
      };
    },
  };
}

const originalArgv = [...process.argv];
let bridgeStateDir: string | undefined;

afterEach(() => {
  process.argv.length = 0;
  process.argv.push(...originalArgv);
  if (bridgeStateDir) {
    rmSync(bridgeStateDir, { recursive: true, force: true });
    bridgeStateDir = undefined;
  }
  vi.resetModules();
});

test('a native question is answered and the headless turn settles', async () => {
  const questionReplied = deferred();
  const questionReply = vi.fn(async () => {
    questionReplied.resolve();
    return { data: true };
  });
  const emitted: Array<Record<string, unknown>> = [];
  const emitError = vi.fn();
  const requestToolResult = vi.fn(async () => ({
    output: {
      action: 'answered',
      answers: {
        'question-1': {
          optionIds: ['option-1'],
        },
      },
    },
  }));

  bridgeMock.start = {
    type: 'start',
    operation: 'prompt',
    prompt: 'Ask for clarification.',
  };
  bridgeMock.turn = {
    emit: (event: Record<string, unknown>) => emitted.push(event),
    requestToolResult,
    requestToolApproval: vi.fn(),
    experimental_userMessages: createUserMessages(),
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
    question: {
      reply: questionReply,
      reject: vi.fn(async () => ({ data: true })),
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
              type: 'question.asked',
              properties: {
                id: 'question-request-1',
                sessionID: 'session-1',
                questions: [
                  {
                    question: 'Which framework?',
                    header: 'Framework',
                    options: [
                      {
                        label: 'React',
                        description: 'Use React.',
                      },
                    ],
                    multiple: false,
                    custom: false,
                  },
                ],
                tool: {
                  messageID: 'assistant-message-1',
                  callID: 'question-call-1',
                },
              },
            };
            await questionReplied.promise;
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
      session: {
        context: vi.fn(async () => ({ data: [] })),
        switchModel: vi.fn(async () => ({ data: {} })),
      },
    },
  };

  bridgeStateDir = mkdtempSync(path.join(tmpdir(), 'issue-19800-'));
  process.argv.length = 0;
  process.argv.push(
    process.execPath,
    'opencode-bridge',
    '--workdir',
    '/tmp/issue-19800-workdir',
    '--bridge-state-dir',
    bridgeStateDir,
    '--bootstrap-dir',
    '/tmp/issue-19800-bootstrap',
  );

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      import('./index'),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('OpenCode question turn did not settle')),
          1_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }

  expect(requestToolResult).toHaveBeenCalledOnce();
  expect(questionReply).toHaveBeenCalledWith({
    requestID: 'question-request-1',
    directory: '/tmp/issue-19800-workdir',
    answers: [['React']],
  });
  expect(emitted).toContainEqual(
    expect.objectContaining({
      type: 'tool-call',
      toolCallId: 'question-call-1',
      toolName: 'askUserQuestions',
      nativeName: 'question',
    }),
  );
  expect(emitted.at(-1)).toMatchObject({ type: 'finish' });
  expect(emitError).not.toHaveBeenCalled();
});
