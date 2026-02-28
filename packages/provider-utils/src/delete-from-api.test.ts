import { APICallError } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { deleteFromApi } from './delete-from-api';
import {
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';
import { z } from 'zod/v4';
import { getRuntimeEnvironmentUserAgent } from './get-runtime-environment-user-agent';
import { withUserAgentSuffix } from './with-user-agent-suffix';

vi.mock('./get-runtime-environment-user-agent', async () => {
  const actual = await vi.importActual('./get-runtime-environment-user-agent');
  return {
    ...actual,
    getRuntimeEnvironmentUserAgent: () => 'runtime/test-env',
  };
});

describe('deleteFromApi', () => {
  const mockSuccessResponse = {
    deleted: true,
    id: 'test_123',
  };

  const mockResponseSchema = z.object({
    deleted: z.boolean(),
    id: z.string(),
  });

  const mockHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer test',
    'user-agent': 'runtime/test-env',
  };

  it('should successfully delete and parse response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSuccessResponse), {
        status: 200,
        headers: withUserAgentSuffix(
          mockHeaders,
          getRuntimeEnvironmentUserAgent(),
        ),
      }),
    );

    const result = await deleteFromApi({
      url: 'https://api.test.com/data/123',
      headers: { Authorization: 'Bearer test' },
      successfulResponseHandler: createJsonResponseHandler(mockResponseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    });

    expect(result.value).toEqual(mockSuccessResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/data/123',
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          authorization: 'Bearer test',
          'user-agent': 'ai-sdk/provider-utils/0.0.0-test runtime/test-env',
        },
      }),
    );
  });

  it('should handle API errors', async () => {
    const errorResponse = { error: 'Not Found' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorResponse), {
        status: 404,
        statusText: 'Not Found',
        headers: mockHeaders,
      }),
    );

    await expect(
      deleteFromApi({
        url: 'https://api.test.com/data/123',
        successfulResponseHandler:
          createJsonResponseHandler(mockResponseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
      }),
    ).rejects.toThrow(APICallError);
  });

  it('should handle network errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error('Failed to connect'),
      }),
    );

    await expect(
      deleteFromApi({
        url: 'https://api.test.com/data/123',
        successfulResponseHandler:
          createJsonResponseHandler(mockResponseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
      }),
    ).rejects.toThrow('Cannot connect to API: Failed to connect');
  });

  it('should handle abort signals', async () => {
    const abortController = new AbortController();
    const mockFetch = vi.fn().mockImplementation(() => {
      abortController.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    await expect(
      deleteFromApi({
        url: 'https://api.test.com/data/123',
        successfulResponseHandler:
          createJsonResponseHandler(mockResponseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow('Aborted');
  });

  it('should remove undefined header entries', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSuccessResponse), {
        status: 200,
        headers: mockHeaders,
      }),
    );

    await deleteFromApi({
      url: 'https://api.test.com/data/123',
      headers: {
        Authorization: 'Bearer test',
        'X-Custom-Header': undefined,
      },
      successfulResponseHandler: createJsonResponseHandler(mockResponseSchema),
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      fetch: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/data/123',
      expect.objectContaining({
        headers: {
          authorization: 'Bearer test',
          'user-agent': 'ai-sdk/provider-utils/0.0.0-test runtime/test-env',
        },
      }),
    );
  });

  it('should handle errors in response handlers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('invalid json', {
        status: 200,
        headers: mockHeaders,
      }),
    );

    await expect(
      deleteFromApi({
        url: 'https://api.test.com/data/123',
        successfulResponseHandler:
          createJsonResponseHandler(mockResponseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch: mockFetch,
      }),
    ).rejects.toThrow(APICallError);
  });

  it('should use default fetch when not provided', async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSuccessResponse), {
        status: 200,
        headers: mockHeaders,
      }),
    );
    global.fetch = mockFetch;

    try {
      await deleteFromApi({
        url: 'https://api.test.com/data/123',
        successfulResponseHandler:
          createJsonResponseHandler(mockResponseSchema),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
      });

      expect(mockFetch).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
