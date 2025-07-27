import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createTextStreamResponse } from './create-text-stream-response';

describe('createTextStreamResponse', () => {
  it('should create a Response with correct headers and encoded stream', async () => {
    const response = createTextStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      textStream: convertArrayToReadableStream(['test-data']),
    });

    // Verify response properties
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');

    // Verify headers
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(response.headers.get('Custom-Header')).toBe('test');

    // Verify encoded stream content
    const decoder = new TextDecoder();
    const encodedStream = response.body!;
    const chunks = await convertReadableStreamToArray(encodedStream);
    const decodedChunks = chunks.map(chunk => decoder.decode(chunk));

    expect(decodedChunks).toEqual(['test-data']);
  });
});
