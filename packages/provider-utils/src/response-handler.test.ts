import { z } from 'zod';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from './test';
import { createJsonStreamResponseHandler } from './response-handler';

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
      { success: true, value: { a: 1 } },
      { success: true, value: { a: 2 } },
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
      { success: true, value: { a: 1 } },
    ]);
  });
});
