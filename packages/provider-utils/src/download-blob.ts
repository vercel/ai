import { DownloadError } from './download-error';
import {
  readResponseWithSizeLimit,
  DEFAULT_MAX_DOWNLOAD_SIZE,
} from './read-response-with-size-limit';
import { validateDownloadUrl } from './validate-download-url';

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
    // Follow redirects manually so each hop is validated *before* it is
    // requested. Relying on the default `redirect: 'follow'` would issue the
    // request to a redirect target (e.g. an internal address) before we ever
    // see its URL, defeating the SSRF guard.
    let currentUrl = url;
    let response: Response;
    for (let redirectCount = 0; ; redirectCount++) {
      validateDownloadUrl(currentUrl);

      response = await fetch(currentUrl, {
        signal: options?.abortSignal,
        redirect: 'manual',
      });

      // Browsers return an unreadable opaque response for `redirect: 'manual'`,
      // so the hop cannot be validated here. SSRF is not reachable from the
      // browser anyway (fetch is constrained by CORS and cannot reach a
      // server's internal network or cloud-metadata), so re-issue the request
      // letting the platform follow redirects natively.
      if (response.type === 'opaqueredirect') {
        response = await fetch(currentUrl, {
          signal: options?.abortSignal,
          redirect: 'follow',
        });
        break;
      }

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
