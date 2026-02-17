import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob } from './download-blob';
import { DownloadError } from './download-error';

function createMockStreamResponse({
  body,
  ok = true,
  status = 200,
  statusText = 'OK',
  headers = {},
}: {
  body?: Uint8Array;
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}): Response {
  const responseHeaders = new Headers(headers);

  const stream =
    body != null
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(body);
            controller.close();
          },
        })
      : null;

  return {
    ok,
    status,
    statusText,
    headers: responseHeaders,
    body: stream,
  } as unknown as Response;
}

describe('downloadBlob()', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should download a blob successfully', async () => {
    const content = new TextEncoder().encode('test content');
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockStreamResponse({
        body: content,
        headers: { 'content-type': 'image/png' },
      }),
    );

    const result = await downloadBlob('https://example.com/image.png');

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/png');
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(content);
    expect(fetch).toHaveBeenCalledWith('https://example.com/image.png', {
      signal: undefined,
    });
  });

  it('should throw DownloadError on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockStreamResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    );

    await expect(
      downloadBlob('https://example.com/not-found.png'),
    ).rejects.toThrow(DownloadError);

    try {
      await downloadBlob('https://example.com/not-found.png');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
      if (DownloadError.isInstance(error)) {
        expect(error.url).toBe('https://example.com/not-found.png');
        expect(error.statusCode).toBe(404);
        expect(error.statusText).toBe('Not Found');
        expect(error.message).toBe(
          'Failed to download https://example.com/not-found.png: 404 Not Found',
        );
      }
    }
  });

  it('should throw DownloadError on network error', async () => {
    const networkError = new Error('Network error');
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);

    await expect(
      downloadBlob('https://example.com/network-error.png'),
    ).rejects.toThrow(DownloadError);

    try {
      await downloadBlob('https://example.com/network-error.png');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
      if (DownloadError.isInstance(error)) {
        expect(error.url).toBe('https://example.com/network-error.png');
        expect(error.cause).toBe(networkError);
        expect(error.message).toContain('Network error');
      }
    }
  });

  it('should re-throw DownloadError without wrapping', async () => {
    const originalError = new DownloadError({
      url: 'https://example.com/original.png',
      statusCode: 500,
      statusText: 'Internal Server Error',
    });
    globalThis.fetch = vi.fn().mockRejectedValue(originalError);

    try {
      await downloadBlob('https://example.com/test.png');
    } catch (error) {
      expect(error).toBe(originalError);
      expect(DownloadError.isInstance(error)).toBe(true);
      if (DownloadError.isInstance(error)) {
        expect(error.url).toBe('https://example.com/original.png');
        expect(error.statusCode).toBe(500);
      }
    }
  });

  it('should abort when response exceeds default size limit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockStreamResponse({
        body: new Uint8Array(10),
        headers: {
          'content-length': `${3 * 1024 * 1024 * 1024}`,
        },
      }),
    );

    try {
      await downloadBlob('https://example.com/huge.bin');
      expect.fail('Expected downloadBlob to throw');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
      if (DownloadError.isInstance(error)) {
        expect(error.message).toContain('exceeded maximum size');
      }
    }
  });

  it('should pass abortSignal to fetch', async () => {
    const controller = new AbortController();
    controller.abort();

    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted.', 'AbortError'),
      );

    try {
      await downloadBlob('https://example.com/file.bin', {
        abortSignal: controller.signal,
      });
      expect.fail('Expected downloadBlob to throw');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
    }

    expect(fetch).toHaveBeenCalledWith('https://example.com/file.bin', {
      signal: controller.signal,
    });
  });
});

describe('DownloadError', () => {
  it('should create error with status code and text', () => {
    const error = new DownloadError({
      url: 'https://example.com/test.png',
      statusCode: 403,
      statusText: 'Forbidden',
    });

    expect(error.name).toBe('AI_DownloadError');
    expect(error.url).toBe('https://example.com/test.png');
    expect(error.statusCode).toBe(403);
    expect(error.statusText).toBe('Forbidden');
    expect(error.message).toBe(
      'Failed to download https://example.com/test.png: 403 Forbidden',
    );
  });

  it('should create error with cause', () => {
    const cause = new Error('Connection refused');
    const error = new DownloadError({
      url: 'https://example.com/test.png',
      cause,
    });

    expect(error.url).toBe('https://example.com/test.png');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('Connection refused');
  });

  it('should create error with custom message', () => {
    const error = new DownloadError({
      url: 'https://example.com/test.png',
      message: 'Custom error message',
    });

    expect(error.message).toBe('Custom error message');
  });

  it('should identify DownloadError instances correctly', () => {
    const downloadError = new DownloadError({
      url: 'https://example.com/test.png',
    });
    const regularError = new Error('Not a download error');

    expect(DownloadError.isInstance(downloadError)).toBe(true);
    expect(DownloadError.isInstance(regularError)).toBe(false);
    expect(DownloadError.isInstance(null)).toBe(false);
    expect(DownloadError.isInstance(undefined)).toBe(false);
  });
});
