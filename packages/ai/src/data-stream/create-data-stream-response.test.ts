import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createDataStreamResponse } from './create-data-stream-response';
import { formatDataStreamPart } from './data-stream-parts';

describe('createDataStreamResponse', () => {
  it('should create a Response with correct headers and encoded stream', async () => {
    const response = createDataStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      dataStream: convertArrayToReadableStream([
        formatDataStreamPart('data', ['test-data']),
      ]),
    });

    // Verify response properties
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');

    // Verify headers
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(response.headers.get('X-Vercel-AI-Data-Stream')).toBe('v1');
    expect(response.headers.get('Custom-Header')).toBe('test');

    // Verify encoded stream content
    const decoder = new TextDecoder();
    const encodedStream = response.body!;
    const chunks = await convertReadableStreamToArray(encodedStream);
    const decodedChunks = chunks.map(chunk => decoder.decode(chunk));

    expect(decodedChunks).toEqual([
      formatDataStreamPart('data', ['test-data']),
    ]);
  });

  it('should handle errors in the stream', async () => {
    const response = createDataStreamResponse({
      status: 200,
      dataStream: convertArrayToReadableStream([
        formatDataStreamPart('error', 'Custom error message'),
      ]),
    });

    const decoder = new TextDecoder();
    const encodedStream = response.body!;
    const chunks = await convertReadableStreamToArray(encodedStream);
    const decodedChunks = chunks.map(chunk => decoder.decode(chunk));

    expect(decodedChunks).toEqual([
      formatDataStreamPart('error', 'Custom error message'),
    ]);
  });
});
