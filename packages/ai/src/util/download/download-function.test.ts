import { describe, expect, it, vi } from 'vitest';
import { createDefaultDownloadFunction } from './download-function';

describe('createDefaultDownloadFunction', () => {
  it('should pass the abort signal to downloads', async () => {
    const abortController = new AbortController();
    const download = vi.fn().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'text/plain',
    });

    await createDefaultDownloadFunction(
      download,
      abortController.signal,
    )([
      {
        url: new URL('https://example.com/file.txt'),
        isUrlSupportedByModel: false,
      },
    ]);

    expect(download).toHaveBeenCalledWith({
      url: new URL('https://example.com/file.txt'),
      isUrlSupportedByModel: false,
      abortSignal: abortController.signal,
    });
  });
});
