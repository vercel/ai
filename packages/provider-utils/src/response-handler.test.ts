import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  createEventSourceResponseHandler,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';
import { convertReadableStreamToArray } from './test';

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
});

describe('createEventSourceResponseHandler', () => {
  it('should ignore empty data events', async () => {
    const rawData = {
      type: 'message',
      value: 'ok',
    };

    const response = new Response(
      `data:\n\ndata: ${JSON.stringify(rawData)}\n\ndata: [DONE]\n\n`,
    );
    const handler = createEventSourceResponseHandler(
      z.object({
        type: z.literal('message'),
        value: z.string(),
      }),
    );

    const result = await handler({
      url: 'test-url',
      requestBodyValues: {},
      response,
    });

    await expect(convertReadableStreamToArray(result.value)).resolves.toEqual([
      {
        success: true,
        value: rawData,
        rawValue: rawData,
      },
    ]);
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
});
