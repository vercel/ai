import {
  DownloadError,
  readResponseWithSizeLimit,
  DEFAULT_MAX_DOWNLOAD_SIZE,
  validateDownloadUrl,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
  isBrowserRuntime,
} from '@ai-sdk/provider-utils';
import { VERSION } from '../../version';

const MAX_DOWNLOAD_REDIRECTS = 10;

/**
 * Download a file from a URL.
 *
 * @param url - The URL to download from.
 * @param maxBytes - Maximum allowed download size in bytes. Defaults to 100 MiB.
 * @param abortSignal - An optional abort signal to cancel the download.
 * @returns The downloaded data and media type.
 *
 * @throws DownloadError if the download fails or exceeds maxBytes.
 */
export const download = async ({
  url,
  maxBytes,
  abortSignal,
}: {
  url: URL;
  maxBytes?: number;
  abortSignal?: AbortSignal;
}) => {
  const urlText = url.toString();
  try {
    const headers = withUserAgentSuffix(
      {},
      `ai-sdk/${VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );

    // On the server, follow redirects manually so each hop is validated
    // *before* it is requested. Relying on the default `redirect: 'follow'`
    // would issue the request to a redirect target (e.g. an internal address)
    // before we ever see its URL, defeating the SSRF guard.
    //
    // In the browser this is both impossible and unnecessary: `redirect:
    // 'manual'` yields an unreadable opaque response (so we cannot inspect the
    // hop), and SSRF is a server-side threat — browser fetch is constrained by
    // CORS and cannot reach cloud-metadata or the server's internal network.
    // There we let the platform follow redirects natively.
    const followRedirectsManually = !isBrowserRuntime();

    let currentUrl = urlText;
    let response: Response;
    for (let redirectCount = 0; ; redirectCount++) {
      validateDownloadUrl(currentUrl);

      response = await fetch(currentUrl, {
        headers,
        signal: abortSignal,
        redirect: followRedirectsManually ? 'manual' : 'follow',
      });

      if (followRedirectsManually) {
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          if (redirectCount >= MAX_DOWNLOAD_REDIRECTS) {
            throw new DownloadError({
              url: urlText,
              message: `Too many redirects (max ${MAX_DOWNLOAD_REDIRECTS})`,
            });
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
      }

      break;
    }

    if (!response.ok) {
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
