import { expect, it, describe } from 'vitest';
import { sendDataStreamResponse } from './send-data-stream-response';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';

describe('sendDataStreamResponse', () => {
  it('should create a Response with correct headers and encoded stream', async () => {
    const response = sendDataStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      execute: dataStream => {
        dataStream.appendData('test-data');
      },
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
    const response = sendDataStreamResponse({
      status: 200,
      execute: () => {
        throw new Error('test error');
      },
      onError: () => 'Custom error message',
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
