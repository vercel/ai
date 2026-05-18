import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import type { LanguageModelUsage } from '../types/usage';
import type { UIMessage } from '../ui/ui-messages';
import { toUIMessageStreamResponse } from './to-ui-message-stream-response';

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

describe('toUIMessageStreamResponse', () => {
  it('converts a text stream to a UI message stream response', async () => {
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

    const response = toUIMessageStreamResponse<{}, UIMessage>({
      status: 200,
      stream: convertArrayToReadableStream(parts),
      originalMessages: [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hi' }],
        },
      ],
      generateMessageId: () => 'msg-123',
    });

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers.entries()))
      .toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
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
});
