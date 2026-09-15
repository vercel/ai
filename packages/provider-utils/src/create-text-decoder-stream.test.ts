import { describe, expect, it } from 'vitest';
import { createTextDecoderStream } from './create-text-decoder-stream';
import { convertReadableStreamToArray } from './test/convert-readable-stream-to-array';

function encodeChunks(...parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
}

describe('createTextDecoderStream', () => {
  it('decodes utf-8 chunks with the native TextDecoderStream when available', async () => {
    expect(typeof TextDecoderStream).not.toBe('undefined');

    const values = await convertReadableStreamToArray(
      encodeChunks('hel', 'lo').pipeThrough(createTextDecoderStream()),
    );

    expect(values.join('')).toBe('hello');
  });

  it('falls back to TextDecoder when TextDecoderStream is unavailable', async () => {
    const originalTextDecoderStream = globalThis.TextDecoderStream;
    // Simulate React Native / Expo environments that do not provide TextDecoderStream.
    // @ts-expect-error -- intentionally remove the global for this test
    delete globalThis.TextDecoderStream;

    try {
      expect(typeof TextDecoderStream).toBe('undefined');

      const values = await convertReadableStreamToArray(
        encodeChunks('hel', 'lo').pipeThrough(createTextDecoderStream()),
      );

      expect(values.join('')).toBe('hello');
    } finally {
      globalThis.TextDecoderStream = originalTextDecoderStream;
    }
  });

  it('preserves multi-byte characters split across chunks in the fallback path', async () => {
    const originalTextDecoderStream = globalThis.TextDecoderStream;
    // @ts-expect-error -- intentionally remove the global for this test
    delete globalThis.TextDecoderStream;

    try {
      const emoji = '🙂';
      const bytes = new TextEncoder().encode(emoji);

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Split a multi-byte UTF-8 sequence across two chunks.
          controller.enqueue(bytes.slice(0, 2));
          controller.enqueue(bytes.slice(2));
          controller.close();
        },
      });

      const values = await convertReadableStreamToArray(
        stream.pipeThrough(createTextDecoderStream()),
      );

      expect(values.join('')).toBe(emoji);
    } finally {
      globalThis.TextDecoderStream = originalTextDecoderStream;
    }
  });
});
