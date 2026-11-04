import {
  APICallError,
  InvalidArgumentError,
  JSONParseError,
  TypeValidationError,
} from '@ai-sdk/provider';
import { assert, describe, expect, it } from 'vitest';
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
import { jsonSchema, type FlexibleSchema, type StandardSchema } from './schema';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from './uint8-utils';

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

describe('createJsonResponseHandler with experimental_binaryFields', () => {
  const experimental_binaryFields = ['images[*]'];
  const schema = z.object({
    images: z.array(z.union([z.string(), z.instanceof(Uint8Array)])),
    note: z.string().optional(),
  });
  const encoder = new TextEncoder();

  const placeholder = (byteLength: number) =>
    expect.stringMatching(
      new RegExp(`^\\[binary data: ${byteLength} bytes; ref \\d+-\\d+\\]$`),
    );

  function bytesOf(length: number, seed = 1) {
    const bytes = new Uint8Array(length);
    let state = seed;
    for (let index = 0; index < length; index++) {
      state = (state * 1103515245 + 12345) >>> 0;
      bytes[index] = state >>> 24;
    }
    return bytes;
  }

  // A response that streams its body in chunks, optionally with a
  // Content-Length header like a server that knows the body size.
  function createStreamingResponse(
    body: string,
    { chunkSize = 16 * 1024, contentLength = false } = {},
  ) {
    const data = encoder.encode(body);
    let at = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (at >= data.length) {
            controller.close();
            return;
          }
          controller.enqueue(data.slice(at, at + chunkSize));
          at += chunkSize;
        },
      }),
      {
        headers: {
          'content-type': 'application/json',
          ...(contentLength && { 'content-length': String(data.length) }),
        },
      },
    );
  }

  function run(
    response: Response,
    options: Parameters<typeof createJsonResponseHandler>[1] = {
      experimental_binaryFields,
    },
  ) {
    return createJsonResponseHandler(
      schema,
      options,
    )({
      url: 'test-url',
      requestBodyValues: {},
      response,
    });
  }

  function runWithSchema(
    responseSchema: FlexibleSchema<unknown>,
    body: string,
  ) {
    return createJsonResponseHandler(responseSchema, {
      experimental_binaryFields,
    })({
      url: 'test-url',
      requestBodyValues: {},
      response: new Response(body),
    });
  }

  async function rejection(promise: PromiseLike<unknown>) {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error('expected the promise to reject');
  }

  it('should return decoded bytes as value and a placeholder in rawValue', async () => {
    const bytes = bytesOf(70_001);
    const body = JSON.stringify({
      images: [convertUint8ArrayToBase64(bytes)],
      note: 'hello',
    });

    const result = await run(new Response(body));

    expect(result.value).toEqual({ images: [bytes], note: 'hello' });
    expect(result.rawValue).toEqual({
      images: [placeholder(70_001)],
      note: 'hello',
    });
  });

  it('should return the bytes that decoding the string would give', async () => {
    const base64 = convertUint8ArrayToBase64(bytesOf(70_003, 5));

    const result = await run(
      new Response(JSON.stringify({ images: [base64] })),
    );

    expect(result.value).toEqual({
      images: [convertBase64ToUint8Array(base64)],
    });
  });

  it.each([
    ['a Response built from a string', (body: string) => new Response(body)],
    [
      'a stream without Content-Length',
      (body: string) => createStreamingResponse(body),
    ],
    [
      'a stream with Content-Length',
      (body: string) => createStreamingResponse(body, { contentLength: true }),
    ],
    [
      'a stream of small chunks with Content-Length',
      (body: string) =>
        createStreamingResponse(body, { chunkSize: 4093, contentLength: true }),
    ],
  ])('should decode when the body arrives as %s', async (_name, create) => {
    const bytes = bytesOf(66_001, 3);
    const body = JSON.stringify({
      images: [convertUint8ArrayToBase64(bytes)],
      note: 'ok',
    });

    const result = await run(create(body));

    expect(result.value).toEqual({ images: [bytes], note: 'ok' });
  });

  it('should decode several images and keep the order', async () => {
    const first = bytesOf(66_000, 1);
    const second = bytesOf(70_000, 2);
    const body = JSON.stringify({
      images: [
        convertUint8ArrayToBase64(first),
        convertUint8ArrayToBase64(second),
      ],
    });

    const result = await run(
      createStreamingResponse(body, { chunkSize: 9999 }),
    );

    expect(result.value).toEqual({ images: [first, second] });
  });

  it('should keep strings below 64 KiB and non-canonical strings as strings', async () => {
    const small = convertUint8ArrayToBase64(bytesOf(65_535, 1));
    const large = bytesOf(65_536, 2);
    const notCanonical = `${convertUint8ArrayToBase64(bytesOf(100_000, 3))}\n`;
    const body = JSON.stringify({
      images: [small, convertUint8ArrayToBase64(large), notCanonical],
    });

    const result = await run(new Response(body));

    expect(result.value).toEqual({ images: [small, large, notCanonical] });
    expect(result.rawValue).toEqual({
      images: [small, placeholder(65_536), notCanonical],
    });
  });

  it('should produce the same result as the default handler when nothing is extracted', async () => {
    const body = JSON.stringify({
      images: ['AAAA', 'data:image/png;base64,AAAA'],
      note: 'héllo — 日本語',
    });

    const withFields = await run(new Response(body));
    const withoutFields = await run(new Response(body), {});

    expect(withFields.value).toEqual(withoutFields.value);
    expect(withFields.rawValue).toEqual(withoutFields.rawValue);
    expect(withFields.responseHeaders).toEqual(withoutFields.responseHeaders);
  });

  it.each([
    ['no options', undefined],
    ['empty options', {}],
    ['an empty list', { experimental_binaryFields: [] }],
  ])('should not change the behavior with %s', async (_name, options) => {
    const base64 = convertUint8ArrayToBase64(bytesOf(100_000));

    const result = await createJsonResponseHandler(
      z.any(),
      options,
    )({
      url: 'test-url',
      requestBodyValues: {},
      response: new Response(JSON.stringify({ images: [base64] })),
    });

    expect(result.value).toEqual({ images: [base64] });
    expect(result.rawValue).toEqual({ images: [base64] });
  });

  it('should reject an invalid path when the handler is created', () => {
    expect(() =>
      createJsonResponseHandler(schema, {
        experimental_binaryFields: ['images[0]'],
      }),
    ).toThrow(InvalidArgumentError);
  });

  it('should throw an APICallError with a TypeValidationError cause when the schema does not match', async () => {
    const base64 = convertUint8ArrayToBase64(bytesOf(500_000));
    const body = JSON.stringify({ images: [base64], note: 5 });

    const error = await rejection(run(new Response(body)));

    assert(APICallError.isInstance(error));
    expect(error.message).toBe('Invalid JSON response');
    expect(error.statusCode).toBe(200);
    assert(TypeValidationError.isInstance(error.cause));
    expect(error.cause.value).toEqual({
      images: [placeholder(500_000)],
      note: 5,
    });
    // Neither the error nor the response body carry the megabytes.
    expect(error.cause.message.length).toBeLessThan(500);
    expect(error.responseBody).toMatch(
      /^\{"images":\["\[binary data: 500000 bytes; ref \d+-\d+\]"\],"note":5\}$/,
    );
  });

  it('should throw an APICallError with a JSONParseError cause for invalid JSON', async () => {
    const base64 = convertUint8ArrayToBase64(bytesOf(300_000));
    const body = `{"images":["${base64}"],`;

    const error = await rejection(run(createStreamingResponse(body)));

    assert(APICallError.isInstance(error));
    expect(error.message).toBe('Invalid JSON response');
    assert(JSONParseError.isInstance(error.cause));
    expect(error.cause.text).toBe(error.responseBody);
    expect(error.responseBody).toMatch(
      /^\{"images":\["\[binary data: 300000 bytes; ref \d+-\d+\]"\],$/,
    );
  });

  it('should throw the same errors as the default handler for a body without binary data', async () => {
    const body = '{"images": [1,';

    const withFields = await rejection(run(new Response(body)));
    const withoutFields = await rejection(run(new Response(body), {}));

    assert(APICallError.isInstance(withFields));
    assert(APICallError.isInstance(withoutFields));
    expect(withFields.message).toBe(withoutFields.message);
    expect(withFields.responseBody).toBe(withoutFields.responseBody);
    expect(withFields.cause).toEqual(withoutFields.cause);
  });

  it('should keep rejecting forbidden prototype keys', async () => {
    const base64 = convertUint8ArrayToBase64(bytesOf(100_000));
    const body = `{"images":["${base64}"],"__proto__":{"polluted":true}}`;

    const error = await rejection(run(new Response(body)));

    assert(APICallError.isInstance(error));
    expect(JSONParseError.isInstance(error.cause)).toBe(true);
    expect('polluted' in {}).toBe(false);
  });

  it('should let the schema reject bytes it does not describe', async () => {
    const body = JSON.stringify({
      images: [convertUint8ArrayToBase64(bytesOf(100_000))],
    });

    const error = await rejection(
      runWithSchema(z.object({ images: z.array(z.string()) }), body),
    );

    assert(APICallError.isInstance(error));
    expect(TypeValidationError.isInstance(error.cause)).toBe(true);
  });

  it('should report a validator that throws with the placeholder, never with the bytes', async () => {
    const body = JSON.stringify({
      images: [convertUint8ArrayToBase64(bytesOf(100_000))],
    });
    const failure = new Error('validator crashed');

    const error = await rejection(
      runWithSchema(
        jsonSchema({}, { validate: () => Promise.reject(failure) }),
        body,
      ),
    );

    assert(APICallError.isInstance(error));
    assert(TypeValidationError.isInstance(error.cause));
    expect(error.cause.cause).toBe(failure);
    expect(error.cause.value).toEqual({ images: [placeholder(100_000)] });
    expect(error.cause.message.length).toBeLessThan(1000);
  });

  describe('when a Standard Schema validator rejects the response', () => {
    // Not a Zod schema: the error is made from the value the validator was
    // given, which holds the bytes, and the issues may carry the input they are
    // about, like the issues of arktype do.
    function createRejectingStandardSchema(
      issueFor: (value: { images: unknown[] }) => object,
    ): StandardSchema<unknown> {
      return {
        '~standard': {
          version: 1,
          vendor: 'custom',
          validate: (value: { images: unknown[] }) => ({
            issues: [issueFor(value)],
          }),
        },
      } as StandardSchema<unknown>;
    }

    it('should not print the bytes in the message of the error', async () => {
      const body = JSON.stringify({
        images: [convertUint8ArrayToBase64(bytesOf(500_000))],
        note: 5,
      });

      const error = await rejection(
        runWithSchema(
          createRejectingStandardSchema(() => ({
            message: 'note must be a string',
            path: ['note'],
          })),
          body,
        ),
      );

      assert(APICallError.isInstance(error));
      assert(TypeValidationError.isInstance(error.cause));
      expect(error.cause.message).toContain('note must be a string');
      expect(error.cause.message.length).toBeLessThan(1000);
      // The error of the validator, which the one above wraps.
      assert(TypeValidationError.isInstance(error.cause.cause));
      expect(error.cause.cause.message.length).toBeLessThan(1000);
      // Serializing its value later does not print the bytes either.
      expect(JSON.stringify(error.cause.cause.value)).toBe(error.responseBody);
    });

    it('should not print the bytes that an issue carries', async () => {
      const body = JSON.stringify({
        images: [convertUint8ArrayToBase64(bytesOf(500_000))],
      });

      const error = await rejection(
        runWithSchema(
          createRejectingStandardSchema(({ images }) => ({
            message: 'images[0] must be a string',
            path: ['images', 0],
            data: images[0],
          })),
          body,
        ),
      );

      assert(APICallError.isInstance(error));
      assert(TypeValidationError.isInstance(error.cause));
      expect(error.cause.message).toContain('images[0] must be a string');
      expect(error.cause.message.length).toBeLessThan(1000);
    });
  });

  it('should return arrays that serialize like any other Uint8Array', async () => {
    const bytes = bytesOf(100_000);

    const result = await run(
      new Response(
        JSON.stringify({ images: [convertUint8ArrayToBase64(bytes)] }),
      ),
    );

    const [image] = result.value.images;
    assert(image instanceof Uint8Array);
    expect(JSON.stringify(image)).toBe(JSON.stringify(Uint8Array.from(bytes)));
  });

  it('should return the bytes for a schema without a validate function', async () => {
    const bytes = bytesOf(100_000);
    const body = JSON.stringify({
      images: [convertUint8ArrayToBase64(bytes)],
    });

    const result = await runWithSchema(jsonSchema({}), body);

    expect(result.value).toEqual({ images: [bytes] });
    expect(result.rawValue).toEqual({ images: [placeholder(100_000)] });
  });

  it('should reject oversized responses before reading the body', async () => {
    const { response, cancelled } = createOversizedResponse();

    await expect(run(response)).rejects.toThrow('exceeded maximum size');

    expect(cancelled()).toBe(true);
  });

  it('should reject a response without a body like the default handler does', async () => {
    const error = await rejection(run(new Response(null)));

    assert(APICallError.isInstance(error));
    expect(error.message).toBe('Invalid JSON response');
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
