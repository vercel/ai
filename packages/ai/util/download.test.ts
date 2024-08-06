import { download } from './download';
import { DownloadError } from './download-error';

it('should download data successfully and match expected bytes', async () => {
  const expectedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const mockFetch = (() =>
    Promise.resolve({
      ok: true,
      arrayBuffer: async () => expectedBytes.buffer,
      headers: {
        get: () => 'application/octet-stream',
      },
    })) as unknown as typeof fetch;

  const result = await download({
    url: new URL('http://example.com'),
    fetchImplementation: mockFetch,
  });

  expect(result.data).toEqual(expectedBytes);
  expect(result.mimeType).toBe('application/octet-stream');
});

it('should throw DownloadError when response is not ok', async () => {
  const mockFetch = (() =>
    Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })) as unknown as typeof fetch;

  try {
    await download({
      url: new URL('http://example.com'),
      fetchImplementation: mockFetch,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(DownloadError);
  }
});

it('should throw DownloadError when fetch throws an error', async () => {
  const mockFetch = () => Promise.reject(new Error('Network error'));

  try {
    await download({
      url: new URL('http://example.com'),
      fetchImplementation: mockFetch,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(DownloadError);
  }
});
