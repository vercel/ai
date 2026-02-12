import { DownloadError } from './download-error';

/**
 * Default maximum download size: 2 GiB.
 */
const DEFAULT_MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * Download a file from a URL and return it as a Blob.
 *
 * @param url - The URL to download from.
 * @param options - Optional settings for the download.
 * @param options.maxBytes - Maximum allowed download size in bytes. Defaults to 100 MiB.
 * @param options.abortSignal - An optional abort signal to cancel the download.
 * @returns A Promise that resolves to the downloaded Blob.
 *
 * @throws DownloadError if the download fails or exceeds maxBytes.
 */
export async function downloadBlob(
  url: string,
  options?: { maxBytes?: number; abortSignal?: AbortSignal },
): Promise<Blob> {
  try {
    const response = await fetch(url, {
      signal: options?.abortSignal,
    });

    if (!response.ok) {
      throw new DownloadError({
        url,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_DOWNLOAD_SIZE;

    // Early rejection based on Content-Length header
    const contentLength = response.headers.get('content-length');
    if (contentLength != null) {
      const length = parseInt(contentLength, 10);
      if (!isNaN(length) && length > maxBytes) {
        throw new DownloadError({
          url,
          message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes (Content-Length: ${length}).`,
        });
      }
    }

    const body = response.body;

    // Handle missing body (empty responses)
    if (body == null) {
      return new Blob([new Uint8Array(0)]);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        totalBytes += value.length;

        if (totalBytes > maxBytes) {
          throw new DownloadError({
            url,
            message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`,
          });
        }

        chunks.push(value);
      }
    } finally {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }

    // Concatenate chunks into a single Uint8Array
    const data = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }

    const contentType = response.headers.get('content-type') ?? undefined;
    return new Blob([data], contentType ? { type: contentType } : undefined);
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url, cause: error });
  }
}
