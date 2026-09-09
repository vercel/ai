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
