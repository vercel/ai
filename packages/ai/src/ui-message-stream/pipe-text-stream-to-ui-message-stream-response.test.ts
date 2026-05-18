import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import { createMockServerResponse } from '../test/mock-server-response';
import type { LanguageModelUsage } from '../types/usage';
import type { UIMessage } from '../ui/ui-messages';
import { pipeTextStreamToUIMessageStreamResponse } from './pipe-text-stream-to-ui-message-stream-response';

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

describe('pipeTextStreamToUIMessageStreamResponse', () => {
  it('converts a text stream and writes it to ServerResponse', async () => {
    const mockResponse = createMockServerResponse();

    pipeTextStreamToUIMessageStreamResponse<{}, UIMessage>({
      response: mockResponse,
      status: 200,
      headers: {
        'Custom-Header': 'test',
      },
      stream: convertArrayToReadableStream([
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
      ] satisfies TextStreamPart<{}>[]),
      originalMessages: [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hi' }],
        },
      ],
      generateMessageId: () => 'msg-123',
    });

    await mockResponse.waitForEnd();

    expect(mockResponse.statusCode).toBe(200);
    expect(mockResponse.headers).toMatchInlineSnapshot(`
      {
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "content-type": "text/event-stream",
        "custom-header": "test",
        "x-accel-buffering": "no",
        "x-vercel-ai-ui-message-stream": "v1",
      }
    `);

    expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
      [
        "data: {"type":"start","messageId":"msg-123"}

      ",
        "data: {"type":"text-start","id":"t1"}

      ",
        "data: {"type":"text-delta","id":"t1","delta":"Hello"}

      ",
        "data: {"type":"text-end","id":"t1"}

      ",
        "data: {"type":"finish","finishReason":"stop"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('applies UI message stream options while piping', async () => {
    const mockResponse = createMockServerResponse();

    pipeTextStreamToUIMessageStreamResponse<{}, UIMessage>({
      response: mockResponse,
      sendStart: false,
      stream: convertArrayToReadableStream([
        { type: 'start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', text: 'Hello' },
        { type: 'text-end', id: 't1' },
      ] satisfies TextStreamPart<{}>[]),
    });

    await mockResponse.waitForEnd();

    expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-start","id":"t1"}

      ",
        "data: {"type":"text-delta","id":"t1","delta":"Hello"}

      ",
        "data: {"type":"text-end","id":"t1"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });
});
