import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { createMockServerResponse } from '../test/mock-server-response';
import { pipeUIMessageStreamToResponse } from './pipe-ui-message-stream-to-response';
import { describe, it, expect } from 'vitest';

describe('pipeUIMessageStreamToResponse', () => {
  it('should write to ServerResponse with correct headers and encoded stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeUIMessageStreamToResponse({
      response: mockResponse,
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'test-data' },
        { type: 'text-end', id: '1' },
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
        "x-vercel-ai-ui-message-stream": "v1",
      }
    `);

    // Verify written data using decoded chunks
    const decodedChunks = mockResponse.getDecodedChunks();
    expect(decodedChunks).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-start","id":"1"}

      ",
        "data: {"type":"text-delta","id":"1","delta":"test-data"}

      ",
        "data: {"type":"text-end","id":"1"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

<<<<<<< HEAD
=======
  it('should write an opening comment when keep-alives are enabled', async () => {
    const mockResponse = createMockServerResponse();

    pipeUIMessageStreamToResponse({
      response: mockResponse,
      keepAliveMs: 100,
      stream: convertArrayToReadableStream([
        { type: 'text-delta', id: '1', delta: 'test-data' },
      ]),
    });

    await mockResponse.waitForEnd();

    expect(mockResponse.getDecodedChunks()[0]).toBe(': stream-open\n\n');
  });

  it.each(multipleCookieHeaderInputs)(
    'should preserve multiple Set-Cookie headers with $name',
    async ({ headers }) => {
      const mockResponse = createMockServerResponse();

      pipeUIMessageStreamToResponse({
        response: mockResponse,
        headers,
        stream: convertArrayToReadableStream([
          { type: 'start', messageId: 'message-id' },
          { type: 'finish' },
        ]),
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.headers['set-cookie']).toStrictEqual(cookies);
    },
  );

>>>>>>> 05cdac6c32 (fix: idle UI message streams failing to flush promptly or remain open behind reverse proxies (#21672))
  it('should handle errors in the stream', async () => {
    const mockResponse = createMockServerResponse();

    pipeUIMessageStreamToResponse({
      response: mockResponse,
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'error', errorText: 'Custom error message' },
      ]),
    });

    // Wait for the stream to finish writing
    await mockResponse.waitForEnd();

    // Verify error handling using decoded chunks
    const decodedChunks = mockResponse.getDecodedChunks();
    expect(decodedChunks).toMatchInlineSnapshot(`
      [
        "data: {"type":"error","errorText":"Custom error message"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });
});
