import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createDataStreamResponse } from './create-data-stream-response';

describe('createDataStreamResponse', () => {
  it('should create a Response with correct headers and encoded stream', async () => {
    const response = createDataStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      dataStream: convertArrayToReadableStream([
        { type: 'data', value: ['test-data'] },
      ]),
    });

    // Verify response properties
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');

    // Verify headers
    expect(Object.fromEntries(response.headers.entries()))
      .toMatchInlineSnapshot(`
      {
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "content-type": "text/event-stream",
        "custom-header": "test",
        "x-accel-buffering": "no",
        "x-vercel-ai-data-stream": "v2",
      }
    `);

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"data","value":["test-data"]}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should handle errors in the stream', async () => {
    const response = createDataStreamResponse({
      status: 200,
      dataStream: convertArrayToReadableStream([
        { type: 'error', value: 'Custom error message' },
      ]),
    });

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"error","value":"Custom error message"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });
});
