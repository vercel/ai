import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { createMockServerResponse } from '../test/mock-server-response';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import { pipeUIMessageStreamToResponse } from './pipe-ui-message-stream-to-response';
import { toUIMessageStream } from './to-ui-message-stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from './ui-message-chunks';

const cookies = [
  'theme=light; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
  'locale=en; Path=/',
];

const multipleCookieHeaderInputs = [
  {
    name: 'Headers input',
    headers: new Headers([
      ['set-cookie', cookies[0]],
      ['set-cookie', cookies[1]],
    ]),
  },
  {
    name: 'header pair array input',
    headers: [
      ['set-cookie', cookies[0]],
      ['set-cookie', cookies[1]],
    ],
  },
] satisfies Array<{ name: string; headers: HeadersInit }>;

describe('pipeUIMessageStreamToResponse', () => {
  describe('keepAliveMs', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should write a keep-alive comment before the stream produces its first chunk', async () => {
      const mockResponse = createMockServerResponse();

      pipeUIMessageStreamToResponse({
        response: mockResponse,
        // a stream that never produces anything:
        stream: new ReadableStream<UIMessageChunk>(),
        keepAliveMs: 25_000,
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(mockResponse.getDecodedChunks()).toEqual([': keep-alive\n\n']);

      await vi.advanceTimersByTimeAsync(25_000);

      expect(mockResponse.getDecodedChunks()).toEqual([
        ': keep-alive\n\n',
        ': keep-alive\n\n',
      ]);
    });

    it('should not write keep-alive comments when keepAliveMs is not set', async () => {
      const mockResponse = createMockServerResponse();

      pipeUIMessageStreamToResponse({
        response: mockResponse,
        stream: convertArrayToReadableStream([
          { type: 'text-delta', id: '1', delta: 'test-data' },
        ]),
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(mockResponse.getDecodedChunks()).toEqual([
        'data: {"type":"text-delta","id":"1","delta":"test-data"}\n\n',
        'data: [DONE]\n\n',
      ]);
    });
  });

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

  it('can pipe a stream created by toUIMessageStream', async () => {
    const mockResponse = createMockServerResponse();

    pipeUIMessageStreamToResponse({
      response: mockResponse,
      stream: toUIMessageStream({
        stream: convertArrayToReadableStream([
          { type: 'start' },
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', text: 'Hello' },
          { type: 'text-end', id: 't1' },
        ] satisfies TextStreamPart<{}>[]),
        sendStart: false,
      }),
    });

    await mockResponse.waitForEnd();

    expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-start","id":"t1"}

      ",
        "data: {"type":"text-delta","id":"t1","delta":"Hello"}

      ",
        "data: {"type":"text-end","id":"t1"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });
});
