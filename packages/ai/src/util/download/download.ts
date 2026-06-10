import {
  DownloadError,
  readResponseWithSizeLimit,
  DEFAULT_MAX_DOWNLOAD_SIZE,
  validateDownloadUrl,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
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

    // Follow redirects manually so each hop is validated *before* it is
    // requested. Relying on the default `redirect: 'follow'` would issue the
    // request to a redirect target (e.g. an internal address) before we ever
    // see its URL, defeating the SSRF guard.
    let currentUrl = urlText;
    let response: Response;
    for (let redirectCount = 0; ; redirectCount++) {
      validateDownloadUrl(currentUrl);

      response = await fetch(currentUrl, {
        headers,
        signal: abortSignal,
        redirect: 'manual',
      });

      // A `redirect: 'manual'` request yields an unreadable opaque response in
      // the browser (and in other spec-compliant fetch implementations), so the
      // redirect target cannot be validated here. In a real browser this is
      // safe to follow natively because SSRF is not reachable (fetch is
      // constrained by CORS and cannot reach a server's internal network or
      // cloud-metadata). On any other runtime we cannot validate the hop, so we
      // fail closed rather than follow it blindly and bypass the SSRF guard.
      if (response.type === 'opaqueredirect') {
        if (
          typeof (globalThis as { document?: unknown }).document === 'undefined'
        ) {
          throw new DownloadError({
            url: urlText,
            message: `Redirect from ${currentUrl} could not be validated and was blocked`,
          });
        }
        response = await fetch(currentUrl, {
          headers,
          signal: abortSignal,
          redirect: 'follow',
        });
        break;
      }

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
