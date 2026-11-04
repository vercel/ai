import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import { createMockServerResponse } from '../test/mock-server-response';
import { pipeTextStreamToResponse } from './pipe-text-stream-to-response';
import { toTextStream } from './to-text-stream';
import { describe, it, expect } from 'vitest';

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
      stream: convertArrayToReadableStream(['test-data']),
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

  it.each(multipleCookieHeaderInputs)(
    'should preserve multiple Set-Cookie headers with $name',
    async ({ headers }) => {
      const mockResponse = createMockServerResponse();

      pipeTextStreamToResponse({
        response: mockResponse,
        headers,
        stream: convertArrayToReadableStream(['test-data']),
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.headers['set-cookie']).toStrictEqual(cookies);
    },
  );

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
});
