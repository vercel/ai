import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { deleteFromApi } from './delete-from-api';
import {
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';
import { z } from 'zod/v4';

const responseSchema = z.object({ id: z.string(), deleted: z.boolean() });

describe('deleteFromApi', () => {
  it('sends a DELETE request and parses the response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'file-123', deleted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await deleteFromApi({
      url: 'https://api.test.com/files/file-123',
      headers: { Authorization: 'Bearer test' },
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    });

    expect(result.value).toEqual({ id: 'file-123', deleted: true });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/files/file-123');
    expect(init.method).toBe('DELETE');
    expect(init.headers.authorization).toBe('Bearer test');
  });

  it('throws an APICallError for a failed response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response('not found', { status: 404, statusText: 'Not Found' }),
      );

    await expect(
      deleteFromApi({
        url: 'https://api.test.com/files/file-missing',
        successfulResponseHandler: createJsonResponseHandler(responseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
      }),
    ).rejects.toBeInstanceOf(APICallError);
  });
});
