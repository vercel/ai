import { JSONParseError, TypeValidationError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { parseJsonEventStream } from './parse-json-event-stream';
import { convertArrayToReadableStream } from './test/convert-array-to-readable-stream';
import { convertReadableStreamToArray } from './test/convert-readable-stream-to-array';

const schema = z.object({ text: z.string() });

function parseChunks(chunks: Uint8Array[]) {
  return parseJsonEventStream({
    stream: convertArrayToReadableStream(chunks),
    schema,
  });
}

describe('parseJsonEventStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses SSE responses without TextDecoderStream', async () => {
    vi.stubGlobal('TextDecoderStream', undefined);

    const result = await convertReadableStreamToArray(
      parseChunks([
        new TextEncoder().encode('data: {"text":"hello"}\n\ndata: [DONE]\n\n'),
      ]),
    );

    expect(result).toEqual([
      {
        success: true,
        value: { text: 'hello' },
        rawValue: { text: 'hello' },
      },
    ]);
  });

  it.each([true, false])(
    'preserves UTF-8 characters split across byte chunks (TextDecoderStream available: %s)',
    async available => {
      if (!available) {
        vi.stubGlobal('TextDecoderStream', undefined);
      }

      const bytes = new TextEncoder().encode(
        '\uFEFFdata: {"text":"café 日本語 🌍"}\r\n\r\ndata: {"text":"done"}\n\n',
      );
      const result = await convertReadableStreamToArray(
        parseChunks([
          new Uint8Array(),
          ...Array.from(bytes, byte => new Uint8Array([byte])),
        ]),
      );

      expect(result).toEqual([
        {
          success: true,
          value: { text: 'café 日本語 🌍' },
          rawValue: { text: 'café 日本語 🌍' },
        },
        {
          success: true,
          value: { text: 'done' },
          rawValue: { text: 'done' },
        },
      ]);
    },
  );

  it('returns parse failures and continues parsing subsequent events', async () => {
    const result = await convertReadableStreamToArray(
      parseChunks([
        new TextEncoder().encode(
          'data: {invalid}\n\ndata: {"text":42}\n\ndata: {"text":"valid"}\n\n',
        ),
      ]),
    );

    expect(result).toEqual([
      {
        success: false,
        error: expect.any(JSONParseError),
        rawValue: undefined,
      },
      {
        success: false,
        error: expect.any(TypeValidationError),
        rawValue: { text: 42 },
      },
      {
        success: true,
        value: { text: 'valid' },
        rawValue: { text: 'valid' },
      },
    ]);
  });

  it('propagates source stream errors', async () => {
    const error = new Error('response body failed');
    const stream = parseJsonEventStream({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(error);
        },
      }),
      schema,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toBe(error);
  });

  it('cancels the source when the parsed stream is cancelled', async () => {
    const cancel = vi.fn();
    const stream = parseJsonEventStream({
      stream: new ReadableStream<Uint8Array>({ cancel }),
      schema,
    });

    await stream.cancel('stop');
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledWith('stop');
    });
  });
});
