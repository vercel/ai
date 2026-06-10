import { DownloadError } from './download-error';
import {
  readResponseWithSizeLimit,
  DEFAULT_MAX_DOWNLOAD_SIZE,
} from './read-response-with-size-limit';
import { validateDownloadUrl } from './validate-download-url';
import { isBrowserRuntime } from './is-browser-runtime';

const MAX_DOWNLOAD_REDIRECTS = 10;

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

    let currentUrl = url;
    let response: Response;
    for (let redirectCount = 0; ; redirectCount++) {
      validateDownloadUrl(currentUrl);

      response = await fetch(currentUrl, {
        signal: options?.abortSignal,
        redirect: followRedirectsManually ? 'manual' : 'follow',
      });

      if (followRedirectsManually) {
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          if (redirectCount >= MAX_DOWNLOAD_REDIRECTS) {
            throw new DownloadError({
              url,
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
        url,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    const data = await readResponseWithSizeLimit({
      response,
      url,
      maxBytes: options?.maxBytes ?? DEFAULT_MAX_DOWNLOAD_SIZE,
    });

    const contentType = response.headers.get('content-type') ?? undefined;
    return new Blob([data], contentType ? { type: contentType } : undefined);
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url, cause: error });
  }
}
