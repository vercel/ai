import {
  cancelResponseBody,
  DownloadError,
  readResponseWithSizeLimit,
  DEFAULT_MAX_DOWNLOAD_SIZE,
  fetchWithValidatedRedirects,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
} from '@ai-sdk/provider-utils';
import { VERSION } from '../../version';

/**
 * Download a file from a URL.
 *
 * @param url - The URL to download from.
 * @param maxBytes - Maximum allowed download size in bytes. Defaults to 100 MiB.
 * @param abortSignal - An optional abort signal to cancel the download.
 * @param headers - Optional request headers forwarded to the download fetch
 * (for example `Authorization` for authenticated provider media URLs).
 * Merged with the SDK User-Agent suffix.
 * @returns The downloaded data and media type.
 *
 * @throws DownloadError if the download fails or exceeds maxBytes.
 */
export const download = async ({
  url,
  maxBytes,
  abortSignal,
  headers: headersArg,
}: {
  url: URL;
  maxBytes?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}) => {
  const urlText = url.toString();
  try {
    const headers = withUserAgentSuffix(
      headersArg ?? {},
      `ai-sdk/${VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );

    const response = await fetchWithValidatedRedirects({
      url: urlText,
      headers,
      abortSignal,
    });

    if (!response.ok) {
      // Release the connection before rejecting so an error status from an
      // attacker-controlled origin cannot leak open sockets.
      await cancelResponseBody(response);
      throw new DownloadError({
        url: urlText,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    const data = await readResponseWithSizeLimit({
      response,
      url: urlText,
      maxBytes: maxBytes ?? DEFAULT_MAX_DOWNLOAD_SIZE,
    });

    return {
      data,
      mediaType: response.headers.get('content-type') ?? undefined,
    };
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url: urlText, cause: error });
  }
};
