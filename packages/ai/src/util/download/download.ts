import { DownloadError } from '@ai-sdk/provider-utils';
import {
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
} from '@ai-sdk/provider-utils';
import { VERSION } from '../../version';

/**
 * Returns true if the given URL is allowed to be fetched by the default
 * download implementation.
 *
 * This is a basic safeguard against SSRF by restricting schemes and
 * obvious loopback hosts. Callers that need different behavior can supply
 * a custom DownloadFunction.
 */
function isAllowedDownloadUrl(url: URL): boolean {
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    return false;
  }

  return true;
}

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

  if (!isAllowedDownloadUrl(url)) {
    throw new DownloadError({
      url: urlText,
      message: 'Downloading from this URL is not allowed by server policy.',
    } as any);
  }

  try {
    const response = await fetch(urlText, {
      headers: withUserAgentSuffix(
        {},
        `ai-sdk/${VERSION}`,
        getRuntimeEnvironmentUserAgent(),
      ),
    });

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
