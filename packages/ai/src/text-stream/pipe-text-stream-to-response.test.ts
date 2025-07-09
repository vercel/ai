import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { createMockServerResponse } from '../test/mock-server-response';
import { pipeTextStreamToResponse } from './pipe-text-stream-to-response';

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
});
