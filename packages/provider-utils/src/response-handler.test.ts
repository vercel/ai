import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { DEFAULT_MAX_DOWNLOAD_SIZE } from './read-response-with-size-limit';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from './test';
import {
  createJsonErrorResponseHandler,
  createBinaryResponseHandler,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  createJsonStreamResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';

describe('createJsonStreamResponseHandler', () => {
  it('should return a stream of complete json chunks', async () => {
    const handler = createJsonStreamResponseHandler(
      z.object({ a: z.number() }),
    );

    const { value: stream } = await handler({
      url: 'some url',
      requestBodyValues: {},
      response: new Response(
        convertArrayToReadableStream([
          JSON.stringify({ a: 1 }) + '\n',
          JSON.stringify({ a: 2 }) + '\n',
        ]).pipeThrough(new TextEncoderStream()),
      ),
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { success: true, value: { a: 1 }, rawValue: { a: 1 } },
      { success: true, value: { a: 2 }, rawValue: { a: 2 } },
    ]);
  });

  it('should return a stream of partial json chunks', async () => {
    const handler = createJsonStreamResponseHandler(
      z.object({ a: z.number() }),
    );

    const { value: stream } = await handler({
      url: 'some url',
      requestBodyValues: {},
      response: new Response(
        convertArrayToReadableStream([
          '{ "a":', // start
          '1 }\n', // end
        ]).pipeThrough(new TextEncoderStream()),
      ),
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { success: true, value: { a: 1 }, rawValue: { a: 1 } },
    ]);
  });
});

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
  describe('maxEventSize', () => {
    const event = `data: {"value":"${'x'.repeat(100)}"}\n\n`;
    const read = async (maxEventSize?: number) => {
      const handler = createEventSourceResponseHandler(
        z.object({ value: z.string() }),
        maxEventSize == null ? undefined : { maxEventSize },
      );
      // The limit applies to data that is buffered across chunks.
      const chunks = [event.slice(0, 60), event.slice(60)].map(chunk =>
        new TextEncoder().encode(chunk),
      );
      const result = await handler({
        url: 'test-url',
        requestBodyValues: {},
        response: new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              const chunk = chunks.shift();
              if (chunk == null) controller.close();
              else controller.enqueue(chunk);
            },
          }),
          { status: 200 },
        ),
      });
      return result.value.getReader().read();
    };

    it('should fail the stream when an event is larger than maxEventSize', async () => {
      await expect(read(50)).rejects.toMatchObject({
        name: 'ParseError',
        type: 'max-buffer-size-exceeded',
      });
    });

    it('should parse an event within maxEventSize', async () => {
      await expect(read(1000)).resolves.toMatchObject({
        value: { success: true, value: { value: 'x'.repeat(100) } },
      });
    });

    it('should keep the default limit without the option', async () => {
      await expect(read()).resolves.toMatchObject({
        value: { success: true },
      });
    });
  });

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

  it('should fail and cancel the response body when an event exceeds the maximum event size', async () => {
    const dataPrefix = new TextEncoder().encode('data: ');
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    let pullCount = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          // a line that does not end within 80 MiB:
          if (pullCount === 81) {
            controller.close();
            return;
          }
          controller.enqueue(pullCount++ === 0 ? dataPrefix : chunk);
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    const handler = createEventSourceResponseHandler(z.unknown());
    const result = await handler({
      url: 'test-url',
      requestBodyValues: { prompt: 'test' },
      response,
    });

    await expect(result.value.getReader().read()).rejects.toMatchObject({
      type: 'max-buffer-size-exceeded',
    });
    expect(cancelled).toBe(true);
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
