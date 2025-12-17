import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob } from './download-blob';
import { DownloadError } from './download-error';

describe('downloadBlob()', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should download a blob successfully', async () => {
    const mockBlob = new Blob(['test content'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const result = await downloadBlob('https://example.com/image.png');

    expect(result).toBe(mockBlob);
    expect(fetch).toHaveBeenCalledWith('https://example.com/image.png');
  });

  it('should throw DownloadError on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

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
