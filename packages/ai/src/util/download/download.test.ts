import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { download } from './download';
import { DownloadError } from './download-error';
import { describe, it, expect } from 'vitest';

const server = createTestServer({
  'http://example.com/file': {},
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

  describe('size limit enforcement', () => {
    it('should reject download when Content-Length exceeds maxSizeInBytes', async () => {
      const largeContent = Buffer.alloc(10 * 1024 * 1024); // 10MB

      server.urls['http://example.com/file'].response = {
        type: 'binary',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': largeContent.length.toString(),
        },
        body: largeContent,
      };

      try {
        await download({
          url: new URL('http://example.com/file'),
          maxSizeInBytes: 1024 * 1024, // 1MB limit
        });
        expect.fail('Expected download to throw');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DownloadError);
        const downloadError = error as DownloadError;
        expect(downloadError.contentLength).toBe(10 * 1024 * 1024);
        expect(downloadError.maxSize).toBe(1024 * 1024);
        expect(downloadError.message).toContain('exceeds maximum allowed size');
      }
    });

    it('should reject download when actual streamed size exceeds maxSizeInBytes', async () => {
      const largeContent = Buffer.alloc(10 * 1024 * 1024); // 10MB

      // No Content-Length header to test streaming enforcement
      server.urls['http://example.com/file'].response = {
        type: 'binary',
        headers: {
          'content-type': 'application/octet-stream',
        },
        body: largeContent,
      };

      try {
        await download({
          url: new URL('http://example.com/file'),
          maxSizeInBytes: 1024 * 1024, // 1MB limit
        });
        expect.fail('Expected download to throw');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DownloadError);
        const downloadError = error as DownloadError;
        expect(downloadError.contentLength).toBeGreaterThan(1024 * 1024);
        expect(downloadError.maxSize).toBe(1024 * 1024);
      }
    });

    it('should allow download when size is within limit', async () => {
      const smallContent = Buffer.alloc(512 * 1024); // 512KB

      server.urls['http://example.com/file'].response = {
        type: 'binary',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': smallContent.length.toString(),
        },
        body: smallContent,
      };

      const result = await download({
        url: new URL('http://example.com/file'),
        maxSizeInBytes: 1024 * 1024, // 1MB limit
      });

      expect(result.data.length).toBe(512 * 1024);
    });

    it('should use default max size of 100MB when not specified', async () => {
      const content = Buffer.alloc(1024); // 1KB

      server.urls['http://example.com/file'].response = {
        type: 'binary',
        headers: {
          'content-type': 'application/octet-stream',
        },
        body: content,
      };

      const result = await download({
        url: new URL('http://example.com/file'),
      });

      expect(result.data.length).toBe(1024);
    });
  });

  describe('abort signal support', () => {
    it('should respect abort signal', async () => {
      const controller = new AbortController();
      const largeContent = Buffer.alloc(10 * 1024 * 1024); // 10MB

      server.urls['http://example.com/file'].response = {
        type: 'binary',
        headers: {
          'content-type': 'application/octet-stream',
        },
        body: largeContent,
      };

      // Abort immediately
      controller.abort();

      try {
        await download({
          url: new URL('http://example.com/file'),
          abortSignal: controller.signal,
        });
        expect.fail('Expected download to throw');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DownloadError);
        const downloadError = error as DownloadError;
        expect(downloadError.message).toContain('aborted');
      }
    });
  });
});
