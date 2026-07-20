import { TypeValidationError } from '@ai-sdk/provider';
import { parseJsonEventStream, validateTypes } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { uiMessageChunkSchema } from './ui-message-chunks';

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
