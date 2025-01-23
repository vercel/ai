import { z } from 'zod';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from './test';
import {
  createJsonResponseHandler,
  createJsonStreamResponseHandler,
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
