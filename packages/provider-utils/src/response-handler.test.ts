import { z } from 'zod/v4';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from './test';
import {
  createJsonResponseHandler,
  createJsonStreamResponseHandler,
  createBinaryResponseHandler,
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
