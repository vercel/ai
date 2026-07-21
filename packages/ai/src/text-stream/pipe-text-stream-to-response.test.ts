import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { createMockServerResponse } from '../test/mock-server-response';
import { pipeTextStreamToResponse } from './pipe-text-stream-to-response';
import { describe, it, expect } from 'vitest';

describe('pipeTextStreamToResponse', () => {
  it('should write to ServerResponse with correct headers and encoded stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeTextStreamToResponse({
      response: mockResponse,
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      textStream: convertArrayToReadableStream(['test-data']),
    });

    // Wait for the stream to finish writing
    await mockResponse.waitForEnd();

    // Verify response properties
    expect(mockResponse.statusCode).toBe(200);
    expect(mockResponse.statusMessage).toBe('OK');

    // Verify headers
    expect(mockResponse.headers).toMatchInlineSnapshot(`
      {
        "content-type": "text/plain; charset=utf-8",
        "custom-header": "test",
      }
    `);

    // Verify written data using decoded chunks
    expect(mockResponse.getDecodedChunks()).toStrictEqual(['test-data']);
  });
<<<<<<< HEAD
=======

  it('can pipe a stream created by toTextStream', async () => {
    const mockResponse = createMockServerResponse();

    pipeTextStreamToResponse({
      response: mockResponse,
      stream: toTextStream({
        stream: convertArrayToReadableStream([
          { type: 'start' },
          { type: 'text-delta', id: 't1', text: 'Hello' },
          { type: 'text-delta', id: 't1', text: ', world!' },
          { type: 'text-end', id: 't1' },
        ] satisfies TextStreamPart<{}>[]),
      }),
    });

    await mockResponse.waitForEnd();

    expect(mockResponse.getDecodedChunks()).toStrictEqual([
      'Hello',
      ', world!',
    ]);
  });

  it('should reject when reading the stream fails', async () => {
    const mockResponse = createMockServerResponse();
    const error = new Error('stream read failed');
    const stream = new ReadableStream<string>({
      pull() {
        throw error;
      },
    });

    await expect(
      pipeTextStreamToResponse({
        response: mockResponse,
        stream,
      }),
    ).rejects.toBe(error);
  });
>>>>>>> 7f6650b0ea (fix: server-response piping errors bypass caller catches (#17648))
});
