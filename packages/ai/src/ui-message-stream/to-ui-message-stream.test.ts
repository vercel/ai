import { DelayedPromise } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import type { LanguageModelUsage } from '../types/usage';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import type { CompactionUIPart, UIMessage } from '../ui/ui-messages';
import { readUIMessageStream } from './read-ui-message-stream';
import { toUIMessageStream } from './to-ui-message-stream';

const testUsage: LanguageModelUsage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokenDetails: {
    textTokens: undefined,
    reasoningTokens: undefined,
  },
};

const testStep: TextStreamPart<{}> & { type: 'finish-step' } = {
  type: 'finish-step',
  response: { id: 'r', modelId: 'm', timestamp: new Date(0) },
  usage: testUsage,
  performance: {
    effectiveOutputTokensPerSecond: 0,
    outputTokensPerSecond: 0,
    inputTokensPerSecond: 0,
    effectiveTotalTokensPerSecond: 0,
    stepTimeMs: 0,
    responseTimeMs: 0,
    toolExecutionMs: {},
    timeToFirstOutputMs: undefined,
  },
  finishReason: 'stop',
  rawFinishReason: 'stop',
  providerMetadata: undefined,
};

const testCompaction: CompactionUIPart = {
  type: 'compaction',
  version: 1,
  replaces: {
    messageId: 'user-1',
    messageCount: 1,
    partCount: 1,
    digest: '0'.repeat(64),
  },
  messages: [{ role: 'user', content: 'Summarized context' }],
};

describe('toUIMessageStream', () => {
  it('resolves ordered model compaction events against completed UI tool steps without callbacks', async () => {
    const originalMessages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Original question' }],
      },
    ];
    const chunks: unknown[] = [];
    const snapshots = await convertReadableStreamToArray(
      readUIMessageStream({
        stream: toUIMessageStream({
          originalMessages,
          stream: convertArrayToReadableStream<TextStreamPart<{}>>([
            { type: 'start' },
            {
              type: 'compaction',
              messages: [{ role: 'user', content: 'Initial summary' }],
            },
            { type: 'start-step', request: {}, warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: {},
              dynamic: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: {},
              output: 'Result',
              dynamic: true,
            },
            { ...testStep, finishReason: 'tool-calls' },
            {
              type: 'compaction',
              messages: [
                { role: 'user', content: 'Summary including lookup result' },
              ],
            },
            { type: 'start-step', request: {}, warnings: [] },
            { type: 'text-start', id: 'answer' },
            { type: 'text-delta', id: 'answer', text: 'Final answer' },
            { type: 'text-end', id: 'answer' },
            testStep,
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: testUsage,
            },
          ]),
        }).pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              chunks.push(chunk);
              controller.enqueue(chunk);
            },
          }),
        ),
        terminateOnError: true,
      }),
    );
    const response = snapshots.at(-1)!;
    const records = response.parts.filter(part => part.type === 'compaction');

    expect(response.id).not.toBe('');
    expect(records).toHaveLength(2);
    expect(records[0].replaces).toMatchObject({
      messageId: 'user-1',
      messageCount: 1,
      partCount: 1,
    });
    expect(records[1].replaces).toMatchObject({
      messageId: response.id,
      messageCount: 2,
      partCount: 3,
    });
    expect(response.parts).toContainEqual(
      expect.objectContaining({
        type: 'dynamic-tool',
        state: 'output-available',
        output: 'Result',
      }),
    );
    expect(chunks).not.toContainEqual(
      expect.objectContaining({ type: 'compaction-context' }),
    );
    expect(
      await convertToModelMessages(
        JSON.parse(JSON.stringify([...originalMessages, response])),
      ),
    ).toEqual([
      { role: 'user', content: 'Summary including lookup result' },
      { role: 'assistant', content: [{ type: 'text', text: 'Final answer' }] },
    ]);
  });

  it('uses the existing assistant ID when automatic compaction continues a response', async () => {
    const originalMessages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Question' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Previous answer', state: 'done' }],
      },
    ];
    const onEnd = vi.fn();
    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        originalMessages,
        onEnd,
        stream: convertArrayToReadableStream<TextStreamPart<{}>>([
          { type: 'start' },
          {
            type: 'compaction',
            messages: [{ role: 'user', content: 'Continued summary' }],
          },
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: 'stop',
            totalUsage: testUsage,
          },
        ]),
      }),
    );

    expect(chunks[0]).toEqual({ type: 'start', messageId: 'assistant-1' });
    expect(chunks[1]).toMatchObject({
      type: 'compaction',
      replaces: { messageId: 'assistant-1', messageCount: 2, partCount: 1 },
    });
    expect(onEnd.mock.calls[0][0].messages).toHaveLength(2);
    expect(onEnd.mock.calls[0][0].responseMessage.parts).toHaveLength(2);
  });

  it('requires original UI history for an automatic compaction event', async () => {
    await expect(
      convertReadableStreamToArray(
        toUIMessageStream({
          stream: convertArrayToReadableStream<TextStreamPart<{}>>([
            { type: 'start' },
            {
              type: 'compaction',
              messages: [{ role: 'user', content: 'Summary' }],
            },
          ]),
        }),
      ),
    ).rejects.toThrow(
      'Automatic UI compaction requires the original UI messages.',
    );
  });

  it.each([undefined, () => 'shared-response'])(
    'requires the current assistant snapshot when automatic compaction suppresses start',
    async generateMessageId => {
      await expect(
        convertReadableStreamToArray(
          toUIMessageStream({
            originalMessages: [
              {
                id: 'user-1',
                role: 'user',
                parts: [{ type: 'text', text: 'Question' }],
              },
            ],
            sendStart: false,
            generateMessageId,
            stream: convertArrayToReadableStream<TextStreamPart<{}>>([
              { type: 'start' },
              {
                type: 'compaction',
                messages: [{ role: 'user', content: 'Summary' }],
              },
            ]),
          }),
        ),
      ).rejects.toThrow(
        'Automatic UI compaction with sendStart disabled requires originalMessages to end with the current assistant message, including every previously emitted part.',
      );
    },
  );

  it('compacts a suppressed-start continuation using all previously emitted outer parts', async () => {
    const originalMessages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Question' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'data-status', data: { status: 'reading' } },
          { type: 'text', text: 'Outer response text', state: 'done' },
        ],
      },
    ];
    const onEnd = vi.fn();
    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        originalMessages,
        sendStart: false,
        onEnd,
        stream: convertArrayToReadableStream<TextStreamPart<{}>>([
          { type: 'start' },
          {
            type: 'compaction',
            messages: [
              { role: 'user', content: 'Summary including outer response' },
            ],
          },
          { type: 'start-step', request: {}, warnings: [] },
          { type: 'text-start', id: 'answer' },
          { type: 'text-delta', id: 'answer', text: 'Inner response text' },
          { type: 'text-end', id: 'answer' },
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: 'stop',
            totalUsage: testUsage,
          },
        ]),
      }),
    );

    expect(chunks[0]).toMatchObject({
      type: 'compaction',
      replaces: { messageId: 'assistant-1', messageCount: 2, partCount: 2 },
    });
    const messages = onEnd.mock.calls[0][0].messages;
    expect(messages[1].parts.slice(0, 2)).toEqual(originalMessages[1].parts);
    expect(await convertToModelMessages(messages)).toEqual([
      { role: 'user', content: 'Summary including outer response' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Inner response text' }],
      },
    ]);
    expect(originalMessages[1].parts).toHaveLength(2);
  });

  it('cancels the source while tracking automatic compaction state', async () => {
    const cancel = vi.fn();
    const reader = toUIMessageStream({
      originalMessages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Question' }],
        },
      ],
      stream: new ReadableStream<TextStreamPart<{}>>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({
            type: 'compaction',
            messages: [{ role: 'user', content: 'Summary' }],
          });
        },
        cancel,
      }),
    }).getReader();

    await reader.read();
    expect((await reader.read()).value).toMatchObject({ type: 'compaction' });
    await reader.cancel('stop');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith('stop'));
  });

  it('emits compaction after start and includes it in persisted response messages', async () => {
    const onEnd = vi.fn();
    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream<TextStreamPart<{}>>([
          { type: 'start' },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', text: 'Answer' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: 'stop',
            totalUsage: testUsage,
          },
        ]),
        generateMessageId: () => 'assistant-1',
        compaction: testCompaction,
        onEnd,
      }),
    );

    expect(chunks.slice(0, 3)).toEqual([
      { type: 'start', messageId: 'assistant-1' },
      testCompaction,
      { type: 'text-start', id: 'text-1' },
    ]);
    expect(chunks.filter(chunk => chunk.type === 'compaction')).toHaveLength(1);
    expect(onEnd.mock.calls[0][0].responseMessage.parts).toEqual([
      testCompaction,
      expect.objectContaining({ type: 'text', text: 'Answer' }),
    ]);
  });

  it('emits compaction before response content when start is disabled', async () => {
    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream<TextStreamPart<{}>>([
          { type: 'start' },
          { type: 'start-step', request: {}, warnings: [] },
        ]),
        compaction: testCompaction,
        sendStart: false,
      }),
    );

    expect(chunks).toEqual([testCompaction, { type: 'start-step' }]);
  });

  it('retains a compaction record when the source stream has no content', async () => {
    const onEnd = vi.fn();
    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream<TextStreamPart<{}>>([]),
        compaction: testCompaction,
        onEnd,
      }),
    );

    expect(chunks).toEqual([testCompaction]);
    expect(onEnd.mock.calls[0][0].responseMessage.parts).toEqual([
      testCompaction,
    ]);
  });

  it('includes finish-step metadata in the snapshot before forwarding the boundary', async () => {
    const onStepEnd = vi.fn();
    const onEnd = vi.fn();
    const chunks = await convertReadableStreamToArray(
      toUIMessageStream<{}, UIMessage<{ totalTokens: number | undefined }>>({
        stream: convertArrayToReadableStream([
          { type: 'start' },
          { type: 'start-step', request: {}, warnings: [] },
          testStep,
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: 'stop',
            totalUsage: testUsage,
          },
        ]),
        generateMessageId: () => 'assistant-1',
        messageMetadata: ({ part }) =>
          part.type === 'finish-step'
            ? { totalTokens: part.usage.totalTokens }
            : undefined,
        onStepEnd,
        onEnd,
      }),
    );

    expect(chunks).toEqual([
      { type: 'start', messageId: 'assistant-1' },
      { type: 'start-step' },
      { type: 'message-metadata', messageMetadata: { totalTokens: 2 } },
      { type: 'finish-step' },
      { type: 'finish', finishReason: 'stop' },
    ]);
    expect(onStepEnd).toHaveBeenCalledOnce();
    expect(onStepEnd.mock.calls[0][0].responseMessage.metadata).toEqual({
      totalTokens: 2,
    });
    expect(onStepEnd.mock.calls[0][0].responseMessage).toEqual(
      onEnd.mock.calls[0][0].responseMessage,
    );
  });

  it.each([false, true])(
    'resolves the deprecated step callback alias (onStepEnd provided: %s)',
    async hasOnStepEnd => {
      const onStepEnd = vi.fn();
      const onStepFinish = vi.fn();
      await convertReadableStreamToArray(
        toUIMessageStream({
          stream: convertArrayToReadableStream([{ type: 'start' }, testStep]),
          onStepEnd: hasOnStepEnd ? onStepEnd : undefined,
          onStepFinish,
        }),
      );
      expect(onStepEnd).toHaveBeenCalledTimes(hasOnStepEnd ? 1 : 0);
      expect(onStepFinish).toHaveBeenCalledTimes(hasOnStepEnd ? 0 : 1);
    },
  );

  it('awaits the UI callback before delivering finish-step', async () => {
    const callbackStarted = new DelayedPromise<void>();
    const callbackFinished = new DelayedPromise<void>();
    const reader = toUIMessageStream({
      stream: convertArrayToReadableStream([{ type: 'start' }, testStep]),
      onStepEnd: async () => {
        callbackStarted.resolve(undefined);
        await callbackFinished.promise;
      },
    }).getReader();

    expect((await reader.read()).value).toEqual({ type: 'start' });
    const nextRead = reader.read();
    await callbackStarted.promise;
    let boundaryDelivered = false;
    void nextRead.then(() => {
      boundaryDelivered = true;
    });
    await Promise.resolve();
    expect(boundaryDelivered).toBe(false);
    callbackFinished.resolve(undefined);
    expect((await nextRead).value).toEqual({ type: 'finish-step' });
    expect((await reader.read()).done).toBe(true);
  });

  it('maps text and lifecycle parts to UI message chunks', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'start' },
      { type: 'start-step', request: {}, warnings: [] },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: 'Hello' },
      { type: 'text-delta', id: 't1', text: ', world!' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish-step',
        response: { id: 'r', modelId: 'm', timestamp: new Date(0) },
        usage: testUsage,
        performance: {
          effectiveOutputTokensPerSecond: 0,
          outputTokensPerSecond: 0,
          inputTokensPerSecond: 0,
          effectiveTotalTokensPerSecond: 0,
          stepTimeMs: 0,
          responseTimeMs: 0,
          toolExecutionMs: {},
          timeToFirstOutputMs: undefined,
        },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: undefined,
      },
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: testUsage,
      },
    ];

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
      }),
    );

    expect(chunks).toEqual([
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hello' },
      { type: 'text-delta', id: 't1', delta: ', world!' },
      { type: 'text-end', id: 't1' },
      { type: 'finish-step' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('attaches the generated message id to the start chunk when provided', async () => {
    const parts: TextStreamPart<{}>[] = [{ type: 'start' }];
    const generateMessageId = vi.fn(() => 'msg-123');

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        generateMessageId,
      }),
    );

    expect(chunks).toEqual([{ type: 'start', messageId: 'msg-123' }]);
    expect(generateMessageId).toHaveBeenCalledTimes(1);
  });

  it('suppresses start/finish chunks when sendStart/sendFinish are false', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'start' },
      { type: 'text-start', id: 't1' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: testUsage,
      },
    ];

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        sendStart: false,
        sendFinish: false,
      }),
    );

    expect(chunks).toEqual([
      { type: 'text-start', id: 't1' },
      { type: 'text-end', id: 't1' },
    ]);
  });

  it('skips reasoning parts when sendReasoning is false', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', text: 'thinking' },
      { type: 'reasoning-end', id: 'r1' },
    ];

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        sendReasoning: false,
      }),
    );

    expect(chunks).toEqual([]);
  });

  it('routes error parts through onError', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'error', error: new Error('boom') },
    ];

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        onError: error => `handled: ${(error as Error).message}`,
      }),
    );

    expect(chunks).toEqual([{ type: 'error', errorText: 'handled: boom' }]);
  });

  it('emits separate metadata chunks for non-lifecycle parts', async () => {
    type MetadataUIMessage = UIMessage<{ partType: string }>;

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream<{}, MetadataUIMessage>({
        stream: convertArrayToReadableStream([
          { type: 'start' },
          { type: 'text-delta', id: 't1', text: 'Hello' },
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: 'stop',
            totalUsage: testUsage,
          },
        ] satisfies TextStreamPart<{}>[]),
        tools: undefined,
        messageMetadata: ({ part }) => ({ partType: part.type }),
      }),
    );

    expect(chunks).toEqual([
      {
        type: 'start',
        messageMetadata: { partType: 'start' },
      },
      {
        type: 'text-delta',
        id: 't1',
        delta: 'Hello',
      },
      {
        type: 'message-metadata',
        messageMetadata: { partType: 'text-delta' },
      },
      {
        type: 'finish',
        finishReason: 'stop',
        messageMetadata: { partType: 'finish' },
      },
    ]);
  });

  it('injects generated message id and calls onFinish', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'start' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: 'Hello' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: testUsage,
      },
    ];
    const originalMessages: UIMessage[] = [
      {
        id: 'user-msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
      },
    ];
    const generateMessageId = vi.fn(() => 'msg-123');
    const onFinish = vi.fn();

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        originalMessages,
        generateMessageId,
        onFinish,
      }),
    );

    expect(chunks[0]).toEqual({ type: 'start', messageId: 'msg-123' });
    expect(generateMessageId).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({
      isAborted: false,
      isContinuation: false,
      finishReason: 'stop',
      responseMessage: {
        id: 'msg-123',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
      },
      messages: [
        originalMessages[0],
        {
          id: 'msg-123',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });
  });

  it('calls onStepEnd with the accumulated UI message', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'start' },
      { type: 'start-step', request: {}, warnings: [] },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: 'First' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish-step',
        response: { id: 'r1', modelId: 'm', timestamp: new Date(0) },
        usage: testUsage,
        performance: {
          effectiveOutputTokensPerSecond: 0,
          outputTokensPerSecond: 0,
          inputTokensPerSecond: 0,
          effectiveTotalTokensPerSecond: 0,
          stepTimeMs: 0,
          responseTimeMs: 0,
          toolExecutionMs: {},
          timeToFirstOutputMs: undefined,
        },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: undefined,
      },
      { type: 'start-step', request: {}, warnings: [] },
      { type: 'text-start', id: 't2' },
      { type: 'text-delta', id: 't2', text: 'Second' },
      { type: 'text-end', id: 't2' },
      {
        type: 'finish-step',
        response: { id: 'r2', modelId: 'm', timestamp: new Date(0) },
        usage: testUsage,
        performance: {
          effectiveOutputTokensPerSecond: 0,
          outputTokensPerSecond: 0,
          inputTokensPerSecond: 0,
          effectiveTotalTokensPerSecond: 0,
          stepTimeMs: 0,
          responseTimeMs: 0,
          toolExecutionMs: {},
          timeToFirstOutputMs: undefined,
        },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: undefined,
      },
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: testUsage,
      },
    ];
    const originalMessages: UIMessage[] = [
      {
        id: 'user-msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
      },
    ];
    const onStepEnd = vi.fn();

    await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        originalMessages,
        generateMessageId: () => 'assistant-msg-1',
        onStepEnd,
      }),
    );

    expect(onStepEnd).toHaveBeenCalledTimes(2);
    expect(onStepEnd.mock.calls[0][0]).toMatchObject({
      isContinuation: false,
      responseMessage: {
        id: 'assistant-msg-1',
        role: 'assistant',
        parts: [{ type: 'step-start' }, { type: 'text', text: 'First' }],
      },
      messages: [
        originalMessages[0],
        {
          id: 'assistant-msg-1',
          role: 'assistant',
          parts: [{ type: 'step-start' }, { type: 'text', text: 'First' }],
        },
      ],
    });
    expect(onStepEnd.mock.calls[1][0].responseMessage.parts).toMatchObject([
      { type: 'step-start' },
      { type: 'text', text: 'First' },
      { type: 'step-start' },
      { type: 'text', text: 'Second' },
    ]);
  });

  it('calls onEnd when stream finishes', async () => {
    const parts: TextStreamPart<{}>[] = [
      { type: 'start' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: 'Hello' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: testUsage,
      },
    ];
    const onEnd = vi.fn();
    const onFinish = vi.fn();

    await convertReadableStreamToArray(
      toUIMessageStream({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        generateMessageId: () => 'msg-123',
        onEnd,
        onFinish,
      }),
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0]).toMatchObject({
      isAborted: false,
      isContinuation: false,
      finishReason: 'stop',
      responseMessage: {
        id: 'msg-123',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
      },
    });
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('reports the source outcome to onEnd', async () => {
    const observe = async (parts: TextStreamPart<{}>[]) => {
      const onEnd = vi.fn();

      await convertReadableStreamToArray(
        toUIMessageStream({
          stream: convertArrayToReadableStream(parts),
          tools: undefined,
          onEnd,
        }),
      );

      const outcome = onEnd.mock.calls[0][0].outcome;
      return {
        status: outcome.status,
        errorMessage:
          outcome.status === 'failed' && outcome.error instanceof Error
            ? outcome.error.message
            : undefined,
      };
    };

    const finishPart: TextStreamPart<{}> = {
      type: 'finish',
      finishReason: 'stop',
      rawFinishReason: 'stop',
      totalUsage: testUsage,
    };
    const abortPart: TextStreamPart<{}> = {
      type: 'abort',
      reason: 'user cancelled',
    };
    const errorPart: TextStreamPart<{}> = {
      type: 'error',
      error: new Error('generation failed'),
    };

    expect({
      completed: await observe([finishPart]),
      failed: await observe([errorPart]),
      aborted: await observe([abortPart]),
      unknown: await observe([]),
      completedBeforeError: await observe([finishPart, errorPart]),
      completedAfterError: await observe([errorPart, finishPart]),
    }).toMatchInlineSnapshot(`
      {
        "aborted": {
          "errorMessage": undefined,
          "status": "aborted",
        },
        "completed": {
          "errorMessage": undefined,
          "status": "completed",
        },
        "completedAfterError": {
          "errorMessage": undefined,
          "status": "completed",
        },
        "completedBeforeError": {
          "errorMessage": undefined,
          "status": "completed",
        },
        "failed": {
          "errorMessage": "generation failed",
          "status": "failed",
        },
        "unknown": {
          "errorMessage": undefined,
          "status": "unknown",
        },
      }
    `);
  });

  it('reports an errored source stream as failed exactly once', async () => {
    const sourceError = new Error('source stream failed');
    const onEnd = vi.fn();
    const sourceStream = new ReadableStream<TextStreamPart<{}>>({
      start(controller) {
        controller.error(sourceError);
      },
    });

    const stream = toUIMessageStream({
      stream: sourceStream,
      tools: undefined,
      onEnd,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toBe(
      sourceError,
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].outcome).toEqual({
      status: 'failed',
      error: sourceError,
    });
    expect(sourceStream.locked).toBe(false);
  });

  it('releases the source reader lock after completion', async () => {
    const sourceStream = convertArrayToReadableStream<TextStreamPart<{}>>([]);

    await convertReadableStreamToArray(
      toUIMessageStream({ stream: sourceStream, tools: undefined }),
    );

    expect(sourceStream.locked).toBe(false);
  });

  it('releases the source reader lock after cancellation', async () => {
    const onEnd = vi.fn();
    const sourceStream = new ReadableStream<TextStreamPart<{}>>({
      start(controller) {
        controller.enqueue({ type: 'start' });
      },
    });
    const reader = toUIMessageStream({
      stream: sourceStream,
      tools: undefined,
      onEnd,
    }).getReader();

    await reader.read();
    await reader.cancel('consumer cancelled');

    await vi.waitFor(() => expect(sourceStream.locked).toBe(false));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0]).toMatchObject({
      isAborted: false,
      isCancelled: true,
      outcome: { status: 'unknown' },
    });
  });

  it('does not let an earlier finish part hide a source stream failure', async () => {
    const sourceError = new Error('source stream failed after finish');
    const onEnd = vi.fn();
    let pullCount = 0;

    const stream = toUIMessageStream({
      stream: new ReadableStream({
        pull(controller) {
          if (pullCount++ === 0) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: testUsage,
            });
          } else {
            controller.error(sourceError);
          }
        },
      }),
      tools: undefined,
      onEnd,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toBe(
      sourceError,
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].outcome).toEqual({
      status: 'failed',
      error: sourceError,
    });
  });

  it('reports message metadata failures as failed exactly once', async () => {
    const metadataError = new Error('message metadata failed');
    const onEnd = vi.fn();

    const stream = toUIMessageStream({
      stream: convertArrayToReadableStream([
        {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          totalUsage: testUsage,
        },
      ] satisfies TextStreamPart<{}>[]),
      tools: undefined,
      messageMetadata: () => {
        throw metadataError;
      },
      onEnd,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toBe(
      metadataError,
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].outcome).toEqual({
      status: 'failed',
      error: metadataError,
    });
  });

  it('reports UI chunk conversion failures as failed exactly once', async () => {
    const conversionError = new Error('UI chunk conversion failed');
    const onEnd = vi.fn();

    const stream = toUIMessageStream({
      stream: convertArrayToReadableStream([
        { type: 'error', error: new Error('generation failed') },
      ] satisfies TextStreamPart<{}>[]),
      tools: undefined,
      onError: () => {
        throw conversionError;
      },
      onEnd,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toBe(
      conversionError,
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].outcome).toEqual({
      status: 'failed',
      error: conversionError,
    });
  });
});
