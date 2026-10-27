import { TypeValidationError } from '@ai-sdk/provider';
import { parseJsonEventStream, validateTypes } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { uiMessageChunkSchema, type UIMessageChunk } from './ui-message-chunks';

function createEventStream(value: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      controller.close();
    },
  });
}

describe('uiMessageChunkSchema', () => {
  it('accepts built-in compaction records over SSE', async () => {
    const chunk = {
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

    expect(
      await convertReadableStreamToArray(
        parseJsonEventStream({
          stream: createEventStream(chunk),
          schema: uiMessageChunkSchema,
        }),
      ),
    ).toEqual([{ success: true, value: chunk, rawValue: chunk }]);
  });

  it.each([0, -1, 1.5])(
    'rejects an invalid compaction message count of %s',
    async messageCount => {
      await expect(
        validateTypes({
          schema: uiMessageChunkSchema,
          value: {
            type: 'compaction',
            version: 1,
            replaces: {
              messageId: 'user-1',
              messageCount,
              partCount: 1,
              digest: '0'.repeat(64),
            },
            messages: [],
          },
        }),
      ).rejects.toBeInstanceOf(TypeValidationError);
    },
  );

  it('accepts interrupted finish chunks over SSE', async () => {
    const chunk = { type: 'finish', finishReason: 'interrupted' };

    expect(
      await convertReadableStreamToArray(
        parseJsonEventStream({
          stream: createEventStream(chunk),
          schema: uiMessageChunkSchema,
        }),
      ),
    ).toEqual([{ success: true, value: chunk, rawValue: chunk }]);
  });

  it('returns UI message chunks', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        delta: 'Hello, world!',
        id: '123',
      },
    });

    expectTypeOf(chunk).toEqualTypeOf<UIMessageChunk>();
  });

  it('accepts reset-step chunks', async () => {
    await expect(
      validateTypes({
        schema: uiMessageChunkSchema,
        value: { type: 'reset-step' },
      }),
    ).resolves.toEqual({ type: 'reset-step' });
  });

  it('accepts known chunks with fields added by newer servers', async () => {
    const chunk = {
      type: 'tool-output-available',
      toolCallId: 'call-123',
      output: { ok: true },
      optionalFieldFromNewerServer: {
        addedIn: 'future-ai-sdk-version',
      },
    };

    expect(
      await convertReadableStreamToArray(
        parseJsonEventStream({
          stream: createEventStream(chunk),
          schema: uiMessageChunkSchema,
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "rawValue": {
            "optionalFieldFromNewerServer": {
              "addedIn": "future-ai-sdk-version",
            },
            "output": {
              "ok": true,
            },
            "toolCallId": "call-123",
            "type": "tool-output-available",
          },
          "success": true,
          "value": {
            "optionalFieldFromNewerServer": {
              "addedIn": "future-ai-sdk-version",
            },
            "output": {
              "ok": true,
            },
            "toolCallId": "call-123",
            "type": "tool-output-available",
          },
        },
      ]
    `);
  });

  it('rejects chunk types unknown to the client', async () => {
    await expect(
      validateTypes({
        schema: uiMessageChunkSchema,
        value: {
          type: 'future-control-chunk',
        },
      }),
    ).rejects.toBeInstanceOf(TypeValidationError);
  });
});
