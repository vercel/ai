import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { parseJsonEventStream } from './parse-json-event-stream';
import { convertReadableStreamToArray } from './test/convert-readable-stream-to-array';

function createEventStream(...payloads: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    },
  });
}

const schema = z.object({
  content: z.string(),
});

describe('parseJsonEventStream', () => {
  it('parses SSE JSON events', async () => {
    const results = await convertReadableStreamToArray(
      parseJsonEventStream({
        stream: createEventStream(
          JSON.stringify({ content: 'hello' }),
          '[DONE]',
        ),
        schema,
      }),
    );

    expect(results).toEqual([
      {
        success: true,
        value: { content: 'hello' },
        rawValue: { content: 'hello' },
      },
    ]);
  });

  it('parses SSE JSON events when TextDecoderStream is unavailable', async () => {
    const originalTextDecoderStream = globalThis.TextDecoderStream;
    // @ts-expect-error -- intentionally remove the global for this test
    delete globalThis.TextDecoderStream;

    try {
      const results = await convertReadableStreamToArray(
        parseJsonEventStream({
          stream: createEventStream(
            JSON.stringify({ content: 'from-fallback' }),
            '[DONE]',
          ),
          schema,
        }),
      );

      expect(results).toEqual([
        {
          success: true,
          value: { content: 'from-fallback' },
          rawValue: { content: 'from-fallback' },
        },
      ]);
    } finally {
      globalThis.TextDecoderStream = originalTextDecoderStream;
    }
  });
});
