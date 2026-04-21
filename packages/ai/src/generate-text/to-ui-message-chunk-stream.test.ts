import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { LanguageModelUsage } from '../types/usage';
import { UIMessage } from '../ui/ui-messages';
import { TextStreamPart } from './stream-text-result';
import { toUIMessageChunkStream } from './to-ui-message-chunk-stream';

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

describe('toUIMessageChunkStream', () => {
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
      toUIMessageChunkStream<{}, UIMessage>({
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

  it('attaches the responseMessageId to the start chunk when provided', async () => {
    const parts: TextStreamPart<{}>[] = [{ type: 'start' }];

    const chunks = await convertReadableStreamToArray(
      toUIMessageChunkStream<{}, UIMessage>({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        responseMessageId: 'msg-123',
      }),
    );

    expect(chunks).toEqual([{ type: 'start', messageId: 'msg-123' }]);
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
      toUIMessageChunkStream<{}, UIMessage>({
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
      toUIMessageChunkStream<{}, UIMessage>({
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
      toUIMessageChunkStream<{}, UIMessage>({
        stream: convertArrayToReadableStream(parts),
        tools: undefined,
        onError: error => `handled: ${(error as Error).message}`,
      }),
    );

    expect(chunks).toEqual([{ type: 'error', errorText: 'handled: boom' }]);
  });
});
