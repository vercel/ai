import { DownloadError } from './download-error';
import { createUserAgentFetch } from '@ai-sdk/provider-utils';

/**
 * Download a file from a URL.
 *
 * @param url - The URL to download from.
 * @returns The downloaded data and media type.
 *
 * @throws DownloadError if the download fails.
 */
export const download = async ({ url }: { url: URL }) => {
  const urlText = url.toString();
  try {
    const response = await createUserAgentFetch(globalThis.fetch)(urlText);

    if (!response.ok) {
      throw new DownloadError({
        url: urlText,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    return {
      data: new Uint8Array(await response.arrayBuffer()),
      mediaType: response.headers.get('content-type') ?? undefined,
    };
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url: urlText, cause: error });
  }
};
