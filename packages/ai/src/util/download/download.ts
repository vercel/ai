import { DownloadError } from './download-error';
import {
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
} from '@ai-sdk/provider-utils';
import { VERSION } from '../../version';

/**
 * Default maximum download size: 100MB
 * This prevents DoS attacks via unbounded memory consumption.
 */
export const DEFAULT_MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Download a file from a URL with size limits to prevent DoS attacks.
 *
 * @param url - The URL to download from.
 * @param maxSizeInBytes - Maximum allowed download size in bytes. Defaults to 100MB.
 * @param abortSignal - Optional abort signal to cancel the download.
 * @returns The downloaded data and media type.
 *
 * @throws DownloadError if the download fails or exceeds size limits.
 */
export const download = async ({
  url,
  maxSizeInBytes = DEFAULT_MAX_DOWNLOAD_SIZE,
  abortSignal,
}: {
  url: URL;
  maxSizeInBytes?: number;
  abortSignal?: AbortSignal;
}) => {
  const urlText = url.toString();
  try {
    const response = await fetch(urlText, {
      headers: withUserAgentSuffix(
        {},
        `ai-sdk/${VERSION}`,
        getRuntimeEnvironmentUserAgent(),
      ),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new DownloadError({
        url: urlText,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    // Check Content-Length header if available
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader != null) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > maxSizeInBytes) {
        throw new DownloadError({
          url: urlText,
          contentLength,
          maxSize: maxSizeInBytes,
        });
      }
    }

    // Stream response and enforce size limit
    // This protects against missing/incorrect Content-Length headers
    if (response.body == null) {
      throw new DownloadError({
        url: urlText,
        message: `No response body received from ${urlText}`,
      });
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        receivedBytes += value.length;

        if (receivedBytes > maxSizeInBytes) {
          throw new DownloadError({
            url: urlText,
            contentLength: receivedBytes,
            maxSize: maxSizeInBytes,
          });
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine all chunks into a single Uint8Array
    const data = new Uint8Array(receivedBytes);
    let position = 0;
    for (const chunk of chunks) {
      data.set(chunk, position);
      position += chunk.length;
    }

    return {
      data,
      mediaType: response.headers.get('content-type') ?? undefined,
    };
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    // Handle abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DownloadError({
        url: urlText,
        message: `Download aborted for ${urlText}`,
        cause: error,
      });
    }

    throw new DownloadError({ url: urlText, cause: error });
  }
};
