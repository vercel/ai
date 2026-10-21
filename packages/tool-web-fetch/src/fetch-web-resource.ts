import {
  cancelResponseBody,
  DownloadError,
  fetchWithValidatedEndpoint,
  readResponseWithSizeLimit,
  validateDownloadUrl,
  type FetchFunction,
} from '@ai-sdk/provider-utils';

const MAX_REDIRECTS = 5;

// Redirect status codes per the fetch spec (https://fetch.spec.whatwg.org/#redirect-status).
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export type FetchWebResourceResult =
  | {
      type: 'success';
      finalUrl: string;
      statusCode: number;
      contentType: string | undefined;
      body: Uint8Array;
    }
  | {
      type: 'error';
      errorCode:
        | 'url_not_allowed'
        | 'http_error'
        | 'too_large'
        | 'too_many_redirects'
        | 'network_error';
      message: string;
      statusCode?: number;
    };

function hasDownloadErrorCause(error: unknown): boolean {
  for (
    let current = error, depth = 0;
    current != null && depth < 5;
    current = (current as { cause?: unknown }).cause, depth++
  ) {
    if (DownloadError.isInstance(current)) {
      return true;
    }
  }
  return false;
}

/**
 * Fetches an untrusted URL with a GET request.
 *
 * Redirects are followed manually so that every hop is checked against the
 * domain filter and the private-address guard before it is requested. On
 * Node.js, the default transport additionally validates and pins DNS results
 * at connect time. A custom fetch must provide equivalent validation.
 */
export async function fetchWebResource({
  url,
  headers,
  abortSignal,
  maxBytes,
  fetch,
  isDomainAllowed,
}: {
  url: string;
  headers: Record<string, string>;
  abortSignal: AbortSignal;
  maxBytes: number;
  fetch: FetchFunction | undefined;
  isDomainAllowed: (url: URL) => boolean;
}): Promise<FetchWebResourceResult> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    if (!isDomainAllowed(new URL(currentUrl))) {
      return {
        type: 'error',
        errorCode: 'url_not_allowed',
        message:
          redirectCount === 0
            ? `Fetching ${currentUrl} is not allowed by the domain filter.`
            : `Redirect to ${currentUrl} is not allowed by the domain filter.`,
      };
    }

    try {
      validateDownloadUrl(currentUrl);
    } catch (error) {
      return {
        type: 'error',
        errorCode: 'url_not_allowed',
        message: DownloadError.isInstance(error)
          ? error.message
          : `Fetching ${currentUrl} is not allowed.`,
      };
    }

    let response: Response;
    try {
      response = await fetchWithValidatedEndpoint({
        url: currentUrl,
        init: { headers, signal: abortSignal },
        fetch,
        redirect: 'manual',
      });
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // The DNS-pinned transport rejects hostnames that resolve to private
      // addresses with a DownloadError cause.
      if (hasDownloadErrorCause(error)) {
        return {
          type: 'error',
          errorCode: 'url_not_allowed',
          message: `Fetching ${currentUrl} is not allowed: it resolves to a private or reserved address.`,
        };
      }

      return {
        type: 'error',
        errorCode: 'network_error',
        message: `Failed to fetch ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (response.type === 'opaqueredirect') {
      return {
        type: 'error',
        errorCode: 'network_error',
        message: `Redirect from ${currentUrl} could not be validated and was blocked.`,
      };
    }

    const location = response.headers.get('location');
    if (REDIRECT_STATUS_CODES.has(response.status) && location) {
      void cancelResponseBody(response);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      await cancelResponseBody(response);

      const challenged = response.headers.get('cf-mitigated') === 'challenge';
      return {
        type: 'error',
        errorCode: 'http_error',
        statusCode: response.status,
        message: challenged
          ? `Fetching ${currentUrl} was blocked by bot protection (HTTP ${response.status}).`
          : `Fetching ${currentUrl} failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`,
      };
    }

    let body: Uint8Array;
    try {
      body = await readResponseWithSizeLimit({
        response,
        url: currentUrl,
        maxBytes,
      });
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      if (DownloadError.isInstance(error)) {
        return {
          type: 'error',
          errorCode: 'too_large',
          message: `The response from ${currentUrl} exceeds the maximum size of ${maxBytes} bytes.`,
        };
      }

      return {
        type: 'error',
        errorCode: 'network_error',
        message: `Failed to read the response from ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      type: 'success',
      finalUrl: currentUrl,
      statusCode: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      body,
    };
  }

  return {
    type: 'error',
    errorCode: 'too_many_redirects',
    message: `Fetching ${url} exceeded the maximum of ${MAX_REDIRECTS} redirects.`,
  };
}
