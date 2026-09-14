import { afterEach, describe, it, vi } from 'vitest';
import { createEmitStreamEvent } from './create-emit-stream-event';
import { createTranslationState } from './opencode-events';
import type { OpenCodeEvent } from './opencode-types';

const ISSUE_SIGNAL =
  'ISSUE_20748_REPRODUCED: native compaction summary leaked or normalized completion was missing';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
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

vi.mock('./tool-relay', () => ({
  startAuthorizedToolRelay: vi.fn(async () => ({
    authorizeToolCall: vi.fn(),
    close: vi.fn(),
    port: 4097,
  })),
}));

vi.mock('./opencode-path', () => ({
  prependOpenCodeBinToPath: vi.fn(),
}));

function createEmitter() {
  const emitted: Array<Record<string, unknown>> = [];
  const emitRawStreamEvent = createEmitStreamEvent({
    state: createTranslationState(),
    emit: event => emitted.push(event),
    emitWarning: () => undefined,
    emitError: () => undefined,
    toWireToolName: name => name,
    nativeNameField: () => ({}),
    getHostToolName: () => undefined,
    authorizeHostToolCall: () => undefined,
    isMcpToolName: () => false,
    stripWorkDir: file => file,
    formatError: error => String(error),
  });
  const emitStreamEvent = (event: Record<string, unknown>) =>
    emitRawStreamEvent(event as OpenCodeEvent);
  return { emitted, emitStreamEvent };
}

function replayNativeCompaction(auto: boolean) {
  const { emitted, emitStreamEvent } = createEmitter();
  const summaryMessage = {
    type: 'message.updated',
    properties: {
      info: {
        id: 'summary-message',
        sessionID: 'session-1',
        role: 'assistant',
        summary: true,
      },
    },
  };

  emitStreamEvent({
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'compaction-marker',
        sessionID: 'session-1',
        messageID: 'user-message',
        type: 'compaction',
        auto,
      },
    },
  });
  emitStreamEvent(summaryMessage);
  emitStreamEvent(summaryMessage);

  for (const type of ['text', 'reasoning'] as const) {
    emitStreamEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: `summary-${type}`,
          sessionID: 'session-1',
          messageID: 'summary-message',
          type,
          text: '',
        },
      },
    });
    emitStreamEvent({
      type: 'message.part.delta',
      properties: {
        sessionID: 'session-1',
        messageID: 'summary-message',
        partID: `summary-${type}`,
        field: 'text',
        delta: type === 'text' ? 'Saved context' : 'Internal reasoning',
      },
    });
    emitStreamEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: `summary-${type}`,
          sessionID: 'session-1',
          messageID: 'summary-message',
          type,
          text: type === 'text' ? 'Saved context.' : 'Internal reasoning.',
          time: { end: 2 },
        },
      },
    });
  }

  emitStreamEvent({
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'summary-usage',
        sessionID: 'session-1',
        messageID: 'summary-message',
        type: 'step-finish',
        reason: 'stop',
        tokens: {
          input: 1000,
          output: 20,
          reasoning: 5,
          cache: { read: 100, write: 0 },
        },
      },
    },
  });
  emitStreamEvent({
    type: 'session.compacted',
    properties: { sessionID: 'session-1' },
  });
  emitStreamEvent({
    type: 'session.compacted',
    properties: { sessionID: 'session-1' },
  });
  emitStreamEvent(summaryMessage);

  emitStreamEvent({
    type: 'message.updated',
    properties: {
      info: {
        id: 'answer-message',
        sessionID: 'session-1',
        role: 'assistant',
      },
    },
  });
  emitStreamEvent({
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'answer-text',
        sessionID: 'session-1',
        messageID: 'answer-message',
        type: 'text',
        text: 'The answer continues.',
        time: { end: 3 },
      },
    },
  });

  return emitted;
}

function createUserMessages() {
  return {
    pendingCount: 0,
    close: vi.fn(),
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: true as const, value: undefined }),
      };
    },
  };
}

function hasUsage(emitted: Array<Record<string, unknown>>): boolean {
  return emitted.some(event => {
    if (event.type !== 'finish-step') return false;
    const usage = event.usage as
      | {
          inputTokens?: { total?: number };
          outputTokens?: { total?: number };
        }
      | undefined;
    return (
      usage?.inputTokens?.total === 1000 && usage.outputTokens?.total === 25
    );
  });
}

function recordTranslatorFailures(
  failures: string[],
  auto: boolean,
  emitted: Array<Record<string, unknown>>,
) {
  const trigger = auto ? 'auto' : 'manual';
  const compactions = emitted.filter(event => event.type === 'compaction');
  if (
    compactions.length !== 1 ||
    compactions[0].trigger !== trigger ||
    compactions[0].summary !== 'Saved context.'
  ) {
    failures.push(
      `${trigger} translator emitted compactions ${JSON.stringify(compactions)}`,
    );
  }

  const leakedSummaryEvents = emitted.filter(
    event =>
      typeof event.id === 'string' &&
      event.id.startsWith('summary-') &&
      /^(text|reasoning)-/.test(String(event.type)),
  );
  if (leakedSummaryEvents.length > 0) {
    failures.push(
      `${trigger} translator leaked ${JSON.stringify(leakedSummaryEvents)}`,
    );
  }

  if (!hasUsage(emitted)) {
    failures.push(`${trigger} translator lost compaction usage`);
  }

  if (
    !emitted.some(
      event =>
        event.type === 'text-delta' &&
        event.id === 'answer-text' &&
        event.delta === 'The answer continues.',
    )
  ) {
    failures.push(`${trigger} translator suppressed ordinary output afterward`);
  }
}

describe('issue #20748', () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv.length = 0;
    process.argv.push(...originalArgv);
    vi.resetModules();
  });

  it('keeps native compaction internal and returns its normalized completion', async () => {
    const primaryFailures: string[] = [];
    const secondaryFailures: string[] = [];

    for (const auto of [true, false]) {
      recordTranslatorFailures(
        primaryFailures,
        auto,
        replayNativeCompaction(auto),
      );
    }

    const failedCompaction = createEmitter();
    failedCompaction.emitStreamEvent({
      type: 'message.updated',
      properties: {
        info: {
          id: 'failed-summary',
          role: 'assistant',
          summary: true,
        },
      },
    });
    failedCompaction.emitStreamEvent({
      type: 'message.updated',
      properties: {
        info: {
          id: 'failed-summary',
          role: 'assistant',
          summary: true,
          error: { message: 'failed' },
        },
      },
    });
    failedCompaction.emitStreamEvent({
      type: 'session.compacted',
      properties: {},
    });
    failedCompaction.emitStreamEvent({
      type: 'message.part.updated',
      properties: { part: { type: 'compaction', auto: false } },
    });
    failedCompaction.emitStreamEvent({
      type: 'message.updated',
      properties: {
        info: {
          id: 'next-summary',
          role: 'assistant',
          summary: true,
        },
      },
    });
    failedCompaction.emitStreamEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'next-summary-text',
          messageID: 'next-summary',
          type: 'text',
          text: 'Recovered context.',
        },
      },
    });
    failedCompaction.emitStreamEvent({
      type: 'session.compacted',
      properties: {},
    });

    const failedRawEvents = failedCompaction.emitted.filter(
      event =>
        event.type === 'raw' &&
        (event.rawValue as { status?: unknown } | undefined)?.status ===
          'failed',
    );
    const recoveredCompactions = failedCompaction.emitted.filter(
      event => event.type === 'compaction',
    );
    if (
      failedRawEvents.length !== 1 ||
      recoveredCompactions.length !== 1 ||
      recoveredCompactions[0].summary !== 'Recovered context.' ||
      recoveredCompactions[0].trigger !== 'manual'
    ) {
      secondaryFailures.push(
        `failed compaction recovery emitted ${JSON.stringify(failedCompaction.emitted)}`,
      );
    }

    const bridgeEvents: Array<Record<string, unknown>> = [];
    const emitError = vi.fn();
    bridgeMock.start = {
      type: 'start',
      operation: 'compact',
      model: 'openai/test-model',
      resumeSessionId: 'session-1',
    };
    bridgeMock.turn = {
      emit: (event: Record<string, unknown>) => bridgeEvents.push(event),
      requestToolResult: vi.fn(),
      requestToolApproval: vi.fn(),
      experimental_userMessages: createUserMessages(),
      abortSignal: new AbortController().signal,
      firstTurn: false,
      bridgeLog: vi.fn(),
      emitWarning: vi.fn(),
      emitError,
    };
    sdkMock.client = {
      mcp: { status: vi.fn(async () => ({ data: {} })) },
      session: {
        get: vi.fn(async () => ({ data: {} })),
        summarize: vi.fn(async () => ({ data: {} })),
      },
      v2: {
        session: { switchModel: vi.fn(async () => ({ data: {} })) },
      },
      event: {
        subscribe: vi.fn(async () => ({
          stream: {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'message.part.updated',
                properties: {
                  part: {
                    sessionID: 'session-1',
                    type: 'compaction',
                    auto: false,
                  },
                },
              };
              yield {
                type: 'message.updated',
                properties: {
                  info: {
                    sessionID: 'session-1',
                    id: 'summary-1',
                    role: 'assistant',
                    summary: true,
                  },
                },
              };
              yield {
                type: 'message.part.updated',
                properties: {
                  part: {
                    sessionID: 'session-1',
                    messageID: 'summary-1',
                    id: 'summary-text',
                    type: 'text',
                    text: 'Preserved context.',
                  },
                },
              };
              yield {
                type: 'session.compacted',
                properties: { sessionID: 'session-1' },
              };
            },
          },
        })),
      },
    };

    process.argv.length = 0;
    process.argv.push(
      process.execPath,
      'opencode-bridge',
      '--workdir',
      '/work/.reproduction/opencode-bridge-test',
      '--bridge-state-dir',
      '/work/.reproduction/opencode-bridge-state',
      '--bootstrap-dir',
      '/work/.reproduction/opencode-bridge-bootstrap',
    );
    await import('./index');

    const bridgeCompactions = bridgeEvents.filter(
      event => event.type === 'compaction',
    );
    const bridgeLeakedSummary = bridgeEvents.some(
      event =>
        event.type === 'text-delta' && event.delta === 'Preserved context.',
    );
    if (
      bridgeCompactions.length !== 1 ||
      bridgeCompactions[0].trigger !== 'manual' ||
      bridgeCompactions[0].summary !== 'Preserved context.' ||
      bridgeLeakedSummary
    ) {
      primaryFailures.push(
        `manual bridge emitted ${JSON.stringify(bridgeEvents)}`,
      );
    }
    if (emitError.mock.calls.length > 0) {
      secondaryFailures.push(
        `manual bridge reported ${JSON.stringify(emitError.mock.calls)}`,
      );
    }
    if (bridgeEvents.at(-1)?.type !== 'finish') {
      secondaryFailures.push('manual bridge did not finish');
    }

    if (primaryFailures.length > 0) {
      throw new Error(
        `${ISSUE_SIGNAL}\n${[...primaryFailures, ...secondaryFailures].join('\n')}`,
      );
    }
    if (secondaryFailures.length > 0) {
      throw new Error(
        `ISSUE_20748_SECONDARY_ASSERTION_FAILED\n${secondaryFailures.join('\n')}`,
      );
    }
  });
});
