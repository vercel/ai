import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createUIMessageStreamResponse } from './create-ui-message-stream-response';

describe('createUIMessageStreamResponse', () => {
  it('should create a Response with correct headers and encoded stream', async () => {
    const response = createUIMessageStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      stream: convertArrayToReadableStream([
        { type: 'text', text: 'test-data' },
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
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"text","text":"test-data"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should handle errors in the stream', async () => {
    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'error', errorText: 'Custom error message' },
      ]),
    });

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"error","errorText":"Custom error message"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });
});
