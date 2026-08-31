import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { postMultipartStreamToApi } from './post-multipart-stream-to-api';
import {
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';
import { z } from 'zod/v4';

const responseSchema = z.object({ id: z.string() });

function streamFromChunks(chunks: Array<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function parseCapturedFormData(init: {
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array>;
}): Promise<FormData> {
  return new Response(init.body, {
    headers: { 'content-type': init.headers['content-type'] },
  }).formData();
}

describe('postMultipartStreamToApi', () => {
  it('sends a parseable multipart body with parts in array order', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'file-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await postMultipartStreamToApi({
      url: 'https://api.test.com/files',
      headers: { Authorization: 'Bearer test' },
      parts: [
        { type: 'field', name: 'purpose', value: 'batch' },
        { type: 'field', name: 'expires_after[seconds]', value: '172800' },
        {
          type: 'file',
          name: 'file',
          filename: 'batch.jsonl',
          mediaType: 'application/jsonl',
          content: streamFromChunks(['{"a":1}\n', '{"b":2}\n']),
        },
      ],
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    });

    expect(result.value).toEqual({ id: 'file-123' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/files');
    expect(init.method).toBe('POST');
    expect(init.duplex).toBe('half');
    expect(init.headers['content-type']).toMatch(
      /^multipart\/form-data; boundary=ai-sdk-multipart-/,
    );
    expect(init.headers.authorization).toBe('Bearer test');

    const formData = await parseCapturedFormData(init);
    expect([...formData.keys()]).toEqual([
      'purpose',
      'expires_after[seconds]',
      'file',
    ]);
    expect(formData.get('purpose')).toBe('batch');
    expect(formData.get('expires_after[seconds]')).toBe('172800');

    const file = formData.get('file') as File;
    expect(file.name).toBe('batch.jsonl');
    expect(file.type).toBe('application/jsonl');
    expect(await file.text()).toBe('{"a":1}\n{"b":2}\n');
  });

  it('supports Uint8Array file content and omitted filename/mediaType', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'file-456' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await postMultipartStreamToApi({
      url: 'https://api.test.com/files',
      parts: [
        {
          type: 'file',
          name: 'file',
          content: new TextEncoder().encode('raw-bytes'),
        },
      ],
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    });

    const [, init] = mockFetch.mock.calls[0];
    const bodyText = await new Response(init.body).text();
    expect(bodyText).toContain('Content-Type: application/octet-stream');
    // without a filename the part still parses as a File (default "blob") —
    // omitting filename= would demote it to a scalar string field
    const formData = await new Response(bodyText, {
      headers: { 'content-type': init.headers['content-type'] },
    }).formData();
    const file = formData.get('file') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('blob');
    expect(await file.text()).toBe('raw-bytes');
  });

  it('escapes CR/LF and quotes in part names and filenames', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'file-789' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await postMultipartStreamToApi({
      url: 'https://api.test.com/files',
      parts: [
        {
          type: 'file',
          name: 'file',
          filename: 'evil"\r\nX-Injected: 1.jsonl',
          content: new TextEncoder().encode('x'),
        },
      ],
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    });

    const [, init] = mockFetch.mock.calls[0];
    const bodyText = await new Response(init.body).text();
    expect(bodyText).toContain('filename="evil\\"X-Injected: 1.jsonl"');
    expect(bodyText).not.toContain('evil"\r\nX-Injected');
  });

  it('cancels un-entered source streams when fetch rejects before consuming the body', async () => {
    const cancelSpy = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      cancel: cancelSpy,
    });

    const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      postMultipartStreamToApi({
        url: 'https://api.test.com/files',
        parts: [
          { type: 'field', name: 'purpose', value: 'batch' },
          {
            type: 'file',
            name: 'file',
            filename: 'batch.jsonl',
            content: source,
          },
        ],
        successfulResponseHandler: createJsonResponseHandler(responseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
      }),
    ).rejects.toThrow();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('cancels an in-flight source read when the request is abandoned mid-body', async () => {
    const cancelSpy = vi.fn();
    // one chunk, then stays open: the generator will be suspended in read()
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first-chunk'));
      },
      cancel: cancelSpy,
    });

    const mockFetch = vi.fn(
      (_url: string, init: { body: ReadableStream<Uint8Array> }) =>
        new Promise<Response>((_resolve, reject) => {
          void (async () => {
            const reader = init.body.getReader();
            // consume the preamble + first file chunk, leave the next read pending
            await reader.read();
            await reader.read();
            reject(new TypeError('connection reset'));
          })();
        }),
    );

    await expect(
      postMultipartStreamToApi({
        url: 'https://api.test.com/files',
        parts: [
          {
            type: 'file',
            name: 'file',
            filename: 'batch.jsonl',
            content: source,
          },
        ],
        successfulResponseHandler: createJsonResponseHandler(responseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch as never,
      }),
    ).rejects.toThrow();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('throws an APICallError for a failed response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response('bad request', { status: 400, statusText: 'Bad Request' }),
      );

    await expect(
      postMultipartStreamToApi({
        url: 'https://api.test.com/files',
        parts: [{ type: 'field', name: 'purpose', value: 'batch' }],
        successfulResponseHandler: createJsonResponseHandler(responseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
      }),
    ).rejects.toBeInstanceOf(APICallError);
  });

  it('reports part names but never stream contents in error request values', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response('bad request', { status: 400, statusText: 'Bad Request' }),
      );

    const error = await postMultipartStreamToApi({
      url: 'https://api.test.com/files',
      parts: [
        { type: 'field', name: 'purpose', value: 'batch' },
        {
          type: 'file',
          name: 'file',
          filename: 'batch.jsonl',
          content: streamFromChunks(['secret-content']),
        },
      ],
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    }).catch((e: unknown) => e);

    expect(APICallError.isInstance(error)).toBe(true);
    expect((error as APICallError).requestBodyValues).toEqual({
      purpose: 'batch',
      file: '<file:batch.jsonl>',
    });
  });
});
