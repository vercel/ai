import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import type { LanguageModelUsage } from '../types/usage';
import type { UIMessage } from '../ui/ui-messages';
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

describe('toUIMessageStream', () => {
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
    const sourceStream = new ReadableStream<TextStreamPart<{}>>({
      start(controller) {
        controller.enqueue({ type: 'start' });
      },
    });
    const reader = toUIMessageStream({
      stream: sourceStream,
      tools: undefined,
    }).getReader();

    await reader.read();
    await reader.cancel('consumer cancelled');

    await vi.waitFor(() => expect(sourceStream.locked).toBe(false));
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
