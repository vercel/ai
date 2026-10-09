import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { DEFAULT_MAX_DOWNLOAD_SIZE } from './read-response-with-size-limit';
import {
  createJsonErrorResponseHandler,
  createBinaryResponseHandler,
  createBinaryStreamResponseHandler,
  createEventSourceResponseHandler,
  createJsonLinesResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';

function createOversizedResponse({
  body = '{}',
  status = 200,
  statusText,
}: {
  body?: string;
  status?: number;
  statusText?: string;
} = {}) {
  let cancelled = false;

  return {
    response: new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        status,
        statusText,
        headers: {
          'content-length': String(DEFAULT_MAX_DOWNLOAD_SIZE + 1),
        },
      },
    ),
    cancelled: () => cancelled,
  };
}

describe('createJsonResponseHandler', () => {
  it('should return both parsed value and rawValue', async () => {
    const responseSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const rawData = {
      name: 'John',
      age: 30,
      extraField: 'ignored',
    };

    const response = new Response(JSON.stringify(rawData));
    const handler = createJsonResponseHandler(responseSchema);

    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response,
    });

    expect(result.value).toEqual({
      name: 'John',
      age: 30,
    });
    expect(result.rawValue).toEqual(rawData);
  });

  it('should reject oversized responses before reading the body', async () => {
    const { response, cancelled } = createOversizedResponse();
    const handler = createJsonResponseHandler(z.object({}));

    await expect(
      handler({
        url: 'test-url',
        requestBodyValues: {},
        response,
      }),
    ).rejects.toThrow('exceeded maximum size');

    expect(cancelled()).toBe(true);
  });
});

describe('createEventSourceResponseHandler', () => {
  it('should preserve context and mark response body socket errors as retryable', async () => {
    const socketError = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    });
    const terminatedError = new TypeError('terminated') as TypeError & {
      cause?: unknown;
    };
    terminatedError.cause = socketError;
    let pullCount = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pullCount++ === 0) {
            controller.enqueue(
              new TextEncoder().encode('data: {"value":"partial"}\n\n'),
            );
          } else {
            controller.error(terminatedError);
          }
        },
      }),
      {
        status: 200,
        headers: { 'x-request-id': 'request-id' },
      },
    );
    const handler = createEventSourceResponseHandler(
      z.object({ value: z.string() }),
    );
    const result = await handler({
      url: 'test-url',
      requestBodyValues: { prompt: 'test' },
      response,
    });
    const reader = result.value.getReader();

    await expect(reader.read()).resolves.toMatchObject({
      value: { success: true, value: { value: 'partial' } },
    });

    let observedError: unknown;
    try {
      await reader.read();
    } catch (error) {
      observedError = error;
    }

    expect(APICallError.isInstance(observedError)).toBe(true);
    expect(observedError).toMatchObject({
      name: 'AI_APICallError',
      message: 'Failed to process successful response',
      isRetryable: true,
      statusCode: 200,
      responseHeaders: { 'x-request-id': 'request-id' },
      cause: terminatedError,
    });
  });
});

describe('createJsonLinesResponseHandler', () => {
  const maxLineBytes = 64 * 1024 * 1024;

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid maxLineBytes: %s',
    maxLineBytes => {
      expect(() =>
        createJsonLinesResponseHandler(z.unknown(), { maxLineBytes }),
      ).toThrow('maxLineBytes must be a positive safe integer.');
    },
  );

  it.each([3, 4])(
    'applies a custom byte limit of %s to each UTF-8 row',
    async maxLineBytes => {
      const { value } = await createJsonLinesResponseHandler(z.string(), {
        maxLineBytes,
      })({
        url: 'test-url',
        requestBodyValues: {},
        response: new Response('"é"\n"é"\n'),
      });
      if (maxLineBytes === 3) {
        await expect(value.next()).rejects.toMatchObject({
          name: 'AI_DownloadError',
        });
      } else {
        const lines = [];
        for await (const line of value) lines.push(line);
        expect(lines).toEqual(['é', 'é']);
      }
    },
  );

  it('allows raising the limit above the default', async () => {
    const { value } = await createJsonLinesResponseHandler(z.object({}), {
      maxLineBytes: maxLineBytes + 1,
    })({
      url: 'test-url',
      requestBodyValues: {},
      response: new Response('{}'),
    });
    await expect(value.next()).resolves.toEqual({ value: {}, done: false });
    await expect(value.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });

  it.each(['ASCII', 'UTF-8'])(
    'rejects an oversized %s line across chunks and cancels the body',
    async encoding => {
      const maxLineBytes = 64;
      const chunk = new Uint8Array(16);
      if (encoding === 'ASCII') {
        chunk.fill(65);
      } else {
        // Each character uses two UTF-8 bytes, so the character count stays below the limit.
        for (let i = 0; i < chunk.length; i += 2) {
          chunk[i] = 0xc3;
          chunk[i + 1] = 0xb1;
        }
      }
      let sent = 0;
      let cancelled = false;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent === 6) {
              controller.close();
              return;
            }
            controller.enqueue(chunk);
            sent++;
          },
          cancel() {
            cancelled = true;
            throw new Error('Cancellation failed');
          },
        }),
      );
      const { value } = await createJsonLinesResponseHandler(z.unknown(), {
        maxLineBytes,
      })({
        url: 'test-url',
        requestBodyValues: { test: true },
        response,
      });

      await expect(value.next()).rejects.toMatchObject({
        name: 'AI_DownloadError',
        message: `JSON Lines response exceeded maximum line size of ${maxLineBytes} bytes.`,
        url: 'test-url',
      });
      expect(cancelled).toBe(true);
      expect(response.body!.locked).toBe(false);
    },
  );

  it.each([true, false])(
    'rejects an oversized line in one chunk (trailing newline: %s)',
    async trailingNewline => {
      const bytes = new Uint8Array(
        maxLineBytes + 1 + Number(trailingNewline),
      ).fill(32);
      bytes.set(new TextEncoder().encode('{}'), maxLineBytes - 1);
      if (trailingNewline) bytes[bytes.length - 1] = 10;
      const { value } = await createJsonLinesResponseHandler(z.unknown())({
        url: 'test-url',
        requestBodyValues: {},
        response: new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
        ),
      });

      await expect(value.next()).rejects.toMatchObject({
        name: 'AI_DownloadError',
      });
    },
  );

  it.each([true, false])(
    'accepts a line at the byte limit (trailing newline: %s)',
    async trailingNewline => {
      const maxLineBytes = 64;
      const bytes = new Uint8Array(maxLineBytes + Number(trailingNewline)).fill(
        32,
      );
      bytes.set(new TextEncoder().encode('{}'), maxLineBytes - 2);
      if (trailingNewline) bytes[bytes.length - 1] = 10;
      const { value } = await createJsonLinesResponseHandler(z.object({}), {
        maxLineBytes,
      })({
        url: 'test-url',
        requestBodyValues: {},
        response: new Response(bytes),
      });

      await expect(value.next()).resolves.toEqual({ value: {}, done: false });
      await expect(value.next()).resolves.toEqual({
        value: undefined,
        done: true,
      });
    },
  );

  it('accepts a chunk larger than the limit when each line is below the limit', async () => {
    const maxLineBytes = 64;
    const lineBytes = 8;
    const bytes = new Uint8Array(9 * lineBytes).fill(32);
    for (let i = 1; i <= 9; i++) {
      bytes.set(new TextEncoder().encode('{}\n'), i * lineBytes - 3);
    }
    const { value } = await createJsonLinesResponseHandler(z.object({}), {
      maxLineBytes,
    })({
      url: 'test-url',
      requestBodyValues: {},
      response: new Response(bytes),
    });
    let count = 0;
    for await (const line of value) {
      expect(line).toEqual({});
      count++;
    }
    expect(count).toBe(9);
  });

  it('parses JSON lines across byte boundaries', async () => {
    const bytes = new TextEncoder().encode(
      '{"id":"first","text":"café"}\r\n\n{"id":"second","text":"done"}',
    );
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 24));
          controller.enqueue(bytes.slice(24, 27));
          controller.enqueue(bytes.slice(27));
          controller.close();
        },
      }),
      { headers: { 'x-test': 'value' } },
    );
    const handler = createJsonLinesResponseHandler(
      z.object({ id: z.string(), text: z.string() }),
    );

    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response,
    });
    const values = [];
    for await (const value of result.value) {
      values.push(value);
    }

    expect(values).toEqual([
      { id: 'first', text: 'café' },
      { id: 'second', text: 'done' },
    ]);
    expect(result.responseHeaders).toMatchObject({ 'x-test': 'value' });
  });

  it('errors when a line is invalid JSON', async () => {
    const handler = createJsonLinesResponseHandler(
      z.object({ id: z.string() }),
    );
    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response: new Response('{"id":"first"}\n{invalid}\n'),
    });
    const iterator = result.value;

    await expect(iterator.next()).resolves.toMatchObject({
      value: { id: 'first' },
      done: false,
    });
    await expect(iterator.next()).rejects.toThrow();
  });

  it('cancels the response body when iteration stops early', async () => {
    let cancelled = false;
    const handler = createJsonLinesResponseHandler(
      z.object({ id: z.string() }),
    );
    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response: new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"id":"first"}\n'));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    });

    for await (const _value of result.value) {
      break;
    }

    expect(cancelled).toBe(true);
  });

  it('throws EmptyResponseBodyError when the response body is null', async () => {
    const handler = createJsonLinesResponseHandler(z.object({}));

    await expect(
      handler({
        url: 'test-url',
        requestBodyValues: {},
        response: new Response(null),
      }),
    ).rejects.toThrow('Empty response body');
  });
});

describe('createJsonErrorResponseHandler', () => {
  it('should reject oversized responses before reading the body', async () => {
    const { response, cancelled } = createOversizedResponse({
      body: JSON.stringify({ error: 'too large' }),
      status: 500,
      statusText: 'Internal Server Error',
    });
    const handler = createJsonErrorResponseHandler({
      errorSchema: z.object({ error: z.string() }),
      errorToMessage: error => error.error,
    });

    await expect(
      handler({
        url: 'test-url',
        requestBodyValues: {},
        response,
      }),
    ).rejects.toThrow('exceeded maximum size');

    expect(cancelled()).toBe(true);
  });

  describe('reason', () => {
    const handler = createJsonErrorResponseHandler({
      errorSchema: z.object({ code: z.string() }),
      errorToMessage: error => error.code,
      reason: (_response, error) =>
        error.code === 'context_length_exceeded'
          ? 'context-length-exceeded'
          : undefined,
    });
    const call = (body: string) =>
      handler({
        url: 'test-url',
        requestBodyValues: {},
        response: new Response(body, { status: 400 }),
      });

    it('sets the reason when the parsed error matches', async () => {
      const { value } = await call(
        JSON.stringify({ code: 'context_length_exceeded' }),
      );

      expect(value.reason).toBe('context-length-exceeded');
      expect(value.isRetryable).toBe(false);
    });

    it('leaves the reason unset for other errors', async () => {
      const { value } = await call(JSON.stringify({ code: 'invalid_value' }));

      expect(value.reason).toBeUndefined();
    });

    it('leaves the reason unset when the body cannot be parsed', async () => {
      const { value } = await call('not json');

      expect(value.reason).toBeUndefined();
    });
  });
});

describe('createBinaryResponseHandler', () => {
  it('should handle binary response successfully', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4]);
    const response = new Response(binaryData);
    const handler = createBinaryResponseHandler();

    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response,
    });

    expect(result.value).toBeInstanceOf(Uint8Array);
    expect(result.value).toEqual(binaryData);
  });

  it('should throw APICallError when response body is null', async () => {
    const response = new Response(null);
    const handler = createBinaryResponseHandler();

    await expect(
      handler({
        url: 'test-url',
        requestBodyValues: {},
        response,
      }),
    ).rejects.toThrow('Response body is empty');
  });
});

describe('createBinaryStreamResponseHandler', () => {
  it('should pass the response body through as a stream', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4]);
    const response = new Response(binaryData);
    const handler = createBinaryStreamResponseHandler();

    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response,
    });

    expect(result.value).toBeInstanceOf(ReadableStream);
    const collected = new Uint8Array(
      await new Response(result.value).arrayBuffer(),
    );
    expect(collected).toEqual(binaryData);
  });

  it('should throw EmptyResponseBodyError when response body is null', async () => {
    const response = new Response(null);
    const handler = createBinaryStreamResponseHandler();

    await expect(
      handler({
        url: 'test-url',
        requestBodyValues: {},
        response,
      }),
    ).rejects.toThrow('Empty response body');
  });
});

describe('createStatusCodeErrorResponseHandler', () => {
  it('should create error with status text and response body', async () => {
    const response = new Response('Error message', {
      status: 404,
      statusText: 'Not Found',
    });
    const handler = createStatusCodeErrorResponseHandler();

    const result = await handler({
      url: 'test-url',
      requestBodyValues: { some: 'data' },
      response,
    });

    expect(result.value.message).toBe('Not Found');
    expect(result.value.statusCode).toBe(404);
    expect(result.value.responseBody).toBe('Error message');
    expect(result.value.url).toBe('test-url');
    expect(result.value.requestBodyValues).toEqual({ some: 'data' });
  });

  it('should reject oversized responses before reading the body', async () => {
    const { response, cancelled } = createOversizedResponse({
      body: 'too large',
      status: 500,
      statusText: 'Internal Server Error',
    });
    const handler = createStatusCodeErrorResponseHandler();

    await expect(
      handler({
        url: 'test-url',
        requestBodyValues: { some: 'data' },
        response,
      }),
    ).rejects.toThrow('exceeded maximum size');

    expect(cancelled()).toBe(true);
  });
});
