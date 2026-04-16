import { DownloadError } from './download-error';
import { download } from './download';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('download SSRF protection', () => {
  it('should reject private IPv4 addresses', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254']) {
      try {
        await download({ url: new URL(`http://${ip}/file`) });
        expect.fail(`Expected download to throw for ${ip}`);
      } catch (error) {
        expect(DownloadError.isInstance(error)).toBe(true);
      }
    }
  });

  it('should reject localhost', async () => {
    try {
      await download({ url: new URL('http://localhost/file') });
      expect.fail('Expected download to throw for localhost');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
    }
  });
});

describe('download SSRF redirect protection', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should reject redirects to private IP addresses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: true,
      url: 'http://169.254.169.254/latest/meta-data/',
      headers: new Headers({ 'content-type': 'text/plain' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('secret'));
          controller.close();
        },
      }),
    } as unknown as Response);

    try {
      await download({ url: new URL('https://evil.com/redirect') });
      expect.fail('Expected download to throw');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
    }
  });

  it('should reject redirects to localhost', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: true,
      url: 'http://localhost:8080/admin',
      headers: new Headers({ 'content-type': 'text/plain' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('secret'));
          controller.close();
        },
      }),
    } as unknown as Response);

    try {
      await download({ url: new URL('https://evil.com/redirect') });
      expect.fail('Expected download to throw');
    } catch (error) {
      expect(DownloadError.isInstance(error)).toBe(true);
    }
  });

  it('should allow redirects to safe URLs', async () => {
    const content = new Uint8Array([1, 2, 3]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: true,
      url: 'https://cdn.example.com/image.png',
      headers: new Headers({ 'content-type': 'image/png' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(content);
          controller.close();
        },
      }),
    } as unknown as Response);

    const result = await download({
      url: new URL('https://example.com/image.png'),
    });
    expect(result.data).toEqual(content);
    expect(result.mediaType).toBe('image/png');
  });
});

describe('download', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should download data successfully and match expected bytes', async () => {
    const expectedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(expectedBytes);
          controller.close();
        },
      }),
    } as unknown as Response);

    const result = await download({
      url: new URL('http://example.com/file'),
    });

    expect(result).not.toBeNull();
    expect(result!.data).toEqual(expectedBytes);
    expect(result!.mediaType).toBe('application/octet-stream');

    expect(fetch).toHaveBeenCalledWith(
      'http://example.com/file',
      expect.objectContaining({
        headers: expect.any(Object),
      }),
    );
  });

  it('should allow inline data URLs', async () => {
    const result = await download({
      url: new URL('data:text/plain;base64,aGVsbG8='),
    });

    expect(result.data).toEqual(new TextEncoder().encode('hello'));
    expect(result.mediaType).toBe('text/plain');
  });

  it('should throw DownloadError when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    } as unknown as Response);

    try {
      await download({
        url: new URL('http://example.com/file'),
      });
      expect.fail('Expected download to throw');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DownloadError);
      expect((error as DownloadError).statusCode).toBe(404);
      expect((error as DownloadError).statusText).toBe('Not Found');
    }
  });

  it('should throw DownloadError when fetch throws an error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    try {
      await download({
        url: new URL('http://example.com/file'),
      });
      expect.fail('Expected download to throw');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DownloadError);
    }
  });

  it('should abort when response exceeds default size limit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-length': `${3 * 1024 * 1024 * 1024}`,
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      }),
    } as unknown as Response);

    try {
      await download({
        url: new URL('http://example.com/large'),
      });
      expect.fail('Expected download to throw');
    } catch (error: unknown) {
      expect(DownloadError.isInstance(error)).toBe(true);
      expect((error as DownloadError).message).toContain(
        'exceeded maximum size',
      );
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
      await download({
        url: new URL('http://example.com/file'),
        abortSignal: controller.signal,
      });
      expect.fail('Expected download to throw');
    } catch (error: unknown) {
      expect(DownloadError.isInstance(error)).toBe(true);
    }

    expect(fetch).toHaveBeenCalledWith(
      'http://example.com/file',
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });
});
