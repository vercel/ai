import { cancelResponseBody } from './cancel-response-body';
import { DownloadError } from './download-error';

/**
 * Default maximum download size: 2 GiB.
 *
 * `fetch().arrayBuffer()` has ~2x peak memory overhead (undici buffers the
 * body internally, then creates the JS ArrayBuffer), so very large downloads
 * risk exceeding the default V8 heap limit on 64-bit systems and terminating
 * the process with an out-of-memory error.
 *
 * Setting this limit converts an unrecoverable OOM crash into a catchable
 * `DownloadError`.
 */
export const DEFAULT_MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * Starting capacity for a body of unknown length. Sized to cover a typical
 * response without growing; the buffer doubles from here when it has to.
 */
const INITIAL_BUFFER_BYTES = 64 * 1024;

/**
 * Reads a fetch Response body with a size limit to prevent memory exhaustion.
 *
 * Checks the Content-Length header for early rejection, then reads the body
 * incrementally via ReadableStream and aborts with a DownloadError when the
 * limit is exceeded.
 *
 * @param response - The fetch Response to read.
 * @param url - The URL being downloaded (used in error messages).
 * @param maxBytes - Maximum allowed bytes. Defaults to DEFAULT_MAX_DOWNLOAD_SIZE.
 * @returns A Uint8Array containing the response body.
 * @throws DownloadError if the response exceeds maxBytes.
 */
export async function readResponseWithSizeLimit({
  response,
  url,
  maxBytes = DEFAULT_MAX_DOWNLOAD_SIZE,
}: {
  response: Response;
  url: string;
  maxBytes?: number;
}): Promise<Uint8Array> {
  // Early rejection based on Content-Length header
  const contentLength = response.headers.get('content-length');
  let declaredLength: number | undefined;
  if (contentLength != null) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      // Cancel the body so the underlying connection is released back to the
      // pool instead of being left open until the socket is exhausted.
      await cancelResponseBody(response);
      throw new DownloadError({
        url,
        message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes (Content-Length: ${length}).`,
      });
    }
    if (!isNaN(length) && length >= 0) {
      declaredLength = length;
    }
  }

  const body = response.body;

  // Handle missing body (empty responses)
  if (body == null) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  // Copy every read into a buffer we own instead of retaining the reader's
  // views. A runtime that hands back a view over a fixed-size backing buffer
  // (Deno's chunked bodies, one ~64 KiB buffer per read) keeps that buffer
  // alive for as long as the view is held, so collecting the views makes peak
  // memory chunk count x buffer size rather than the body's size. A declared
  // Content-Length is allocated exactly; otherwise the buffer grows
  // geometrically, which keeps the amortized copy cost linear.
  let buffer = new Uint8Array(declaredLength ?? INITIAL_BUFFER_BYTES);
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const end = totalBytes + value.length;

      if (end > maxBytes) {
        throw new DownloadError({
          url,
          message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`,
        });
      }

      if (end > buffer.length) {
        let capacity = buffer.length;
        while (capacity < end) {
          capacity *= 2;
        }
        const grown = new Uint8Array(capacity);
        grown.set(buffer.subarray(0, totalBytes));
        buffer = grown;
      }

      buffer.set(value, totalBytes);
      totalBytes = end;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancel errors so the original rejection is preserved.
    } finally {
      reader.releaseLock();
    }
  }

  // Return an exactly sized array so an over-allocated buffer is not retained.
  if (totalBytes === buffer.length) {
    return buffer;
  }
  const result = new Uint8Array(totalBytes);
  result.set(buffer.subarray(0, totalBytes));
  return result;
}
