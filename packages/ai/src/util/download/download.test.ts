import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { DownloadError } from '@ai-sdk/provider-utils';
import { download } from './download';
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
});
