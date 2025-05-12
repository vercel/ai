import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { createMockServerResponse } from '../../core/test/mock-server-response';
import { pipeDataStreamToResponse } from './pipe-data-stream-to-response';

describe('pipeDataStreamToResponse', () => {
  it('should write to ServerResponse with correct headers and encoded stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeDataStreamToResponse({
      response: mockResponse,
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      dataStream: convertArrayToReadableStream([
        { type: 'text', value: 'test-data' },
      ]),
    });

    // Wait for the stream to finish writing
    await mockResponse.waitForEnd();

    // Verify response properties
    expect(mockResponse.statusCode).toBe(200);
    expect(mockResponse.statusMessage).toBe('OK');

    // Verify headers
    expect(mockResponse.headers).toMatchInlineSnapshot(`
      {
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "content-type": "text/event-stream",
        "custom-header": "test",
        "x-accel-buffering": "no",
        "x-vercel-ai-data-stream": "v2",
      }
    `);

    // Verify written data using decoded chunks
    const decodedChunks = mockResponse.getDecodedChunks();
    expect(decodedChunks).toMatchInlineSnapshot(`
      [
        "data: {"type":"text","value":"test-data"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should handle errors in the stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeDataStreamToResponse({
      response: mockResponse,
      status: 200,
      dataStream: convertArrayToReadableStream([
        { type: 'error', value: 'Custom error message' },
      ]),
    });

    // Wait for the stream to finish writing
    await mockResponse.waitForEnd();

    // Verify error handling using decoded chunks
    const decodedChunks = mockResponse.getDecodedChunks();
    expect(decodedChunks).toMatchInlineSnapshot(`
      [
        "data: {"type":"error","value":"Custom error message"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });
});
