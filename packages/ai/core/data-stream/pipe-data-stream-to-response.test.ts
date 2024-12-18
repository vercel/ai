import { expect, it, describe } from 'vitest';
import { pipeDataStreamToResponse } from './pipe-data-stream-to-response';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { createMockServerResponse } from '../test/mock-server-response';

describe('pipeDataStreamToResponse', () => {
  it('should write to ServerResponse with correct headers and encoded stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeDataStreamToResponse(mockResponse, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      execute: dataStream => {
        dataStream.writeData('test-data');
      },
    });

    // Wait for the stream to finish writing
    await mockResponse.waitForEnd();

    // Verify response properties
    expect(mockResponse.statusCode).toBe(200);
    expect(mockResponse.statusMessage).toBe('OK');

    // Verify headers
    expect(mockResponse.headers).toMatchObject({
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
      'Custom-Header': 'test',
    });

    // Verify written data using decoded chunks
    const decodedChunks = mockResponse.getDecodedChunks();
    expect(decodedChunks).toStrictEqual([
      formatDataStreamPart('data', ['test-data']),
    ]);
  });

  it('should handle errors in the stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeDataStreamToResponse(mockResponse, {
      status: 200,
      execute: () => {
        throw new Error('test error');
      },
      onError: () => 'Custom error message',
    });

    // Wait for the stream to finish writing
    await mockResponse.waitForEnd();

    // Verify error handling using decoded chunks
    const decodedChunks = mockResponse.getDecodedChunks();
    expect(decodedChunks).toStrictEqual([
      formatDataStreamPart('error', 'Custom error message'),
    ]);
  });
});
