import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { DownloadError } from '@ai-sdk/provider-utils';
import { download } from './download';
import { describe, it, expect, vi, afterEach } from 'vitest';

const server = createTestServer({
  'http://example.com/file': {},
  'http://example.com/large': {},
});

describe('download SSRF protection', () => {
  it('should reject private IPv4 addresses', async () => {
    await expect(
      download({ url: new URL('http://127.0.0.1/file') }),
    ).rejects.toThrow(DownloadError);
    await expect(
      download({ url: new URL('http://10.0.0.1/file') }),
    ).rejects.toThrow(DownloadError);
    await expect(
      download({ url: new URL('http://169.254.169.254/latest/meta-data/') }),
    ).rejects.toThrow(DownloadError);
  });

  it('should reject localhost', async () => {
    await expect(
      download({ url: new URL('http://localhost/file') }),
    ).rejects.toThrow(DownloadError);
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

    await expect(
      download({ url: new URL('https://evil.com/redirect') }),
    ).rejects.toThrow(DownloadError);
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

    await expect(
      download({ url: new URL('https://evil.com/redirect') }),
    ).rejects.toThrow(DownloadError);
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
  it('should download data successfully and match expected bytes', async () => {
    const expectedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    server.urls['http://example.com/file'].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/octet-stream',
      },
      body: Buffer.from(expectedBytes),
    };

    const result = await download({
      url: new URL('http://example.com/file'),
    });

    expect(result).not.toBeNull();
    expect(result!.data).toEqual(expectedBytes);
    expect(result!.mediaType).toBe('application/octet-stream');

    // UA header assertion
    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/');
  });

  it('should throw DownloadError when response is not ok', async () => {
    server.urls['http://example.com/file'].response = {
      type: 'error',
      status: 404,
      body: 'Not Found',
    };

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
    server.urls['http://example.com/file'].response = {
      type: 'error',
      status: 500,
      body: 'Network error',
    };

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
    // Create a response that claims to be larger than 2 GiB
    server.urls['http://example.com/large'].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': `${3 * 1024 * 1024 * 1024}`,
      },
      body: Buffer.from(new Uint8Array(10)),
    };

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

    server.urls['http://example.com/file'].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/octet-stream',
      },
      body: Buffer.from(new Uint8Array([1, 2, 3])),
    };

    try {
      await download({
        url: new URL('http://example.com/file'),
        abortSignal: controller.signal,
      });
      expect.fail('Expected download to throw');
    } catch (error: unknown) {
      // The fetch should be aborted, resulting in a DownloadError wrapping an AbortError
      expect(DownloadError.isInstance(error)).toBe(true);
    }
  });
});
