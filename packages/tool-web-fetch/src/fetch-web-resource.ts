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

// Error messages never include URLs. The model already knows the URL it
// requested, and repeating model-provided input in results lets the model
// place arbitrary text into the conversation.

/**
 * Returns the error or the first of its causes that matches the predicate.
 * Fetch implementations wrap the underlying error, e.g. undici throws
 * `TypeError('fetch failed')` with the system or validation error as `cause`.
 */
function findCause(
  error: unknown,
  predicate: (cause: unknown) => boolean,
): unknown {
  for (
    let current = error, depth = 0;
    current != null && depth < 5;
    current = (current as { cause?: unknown }).cause, depth++
  ) {
    if (predicate(current)) {
      return current;
    }
  }
  return undefined;
}

/**
 * Formats a system error code such as `ENOTFOUND`, which explains a network
 * failure without repeating the URL.
 */
function formatErrorCode(error: unknown): string {
  const cause = findCause(error, cause => {
    const code = (cause as { code?: unknown }).code;
    return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code);
  });
  return cause === undefined ? '' : ` (${(cause as { code: string }).code})`;
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
            ? 'The domain of the URL is not allowed.'
            : 'The URL redirected to a domain that is not allowed.',
      };
    }

    try {
      validateDownloadUrl(currentUrl);
    } catch {
      return {
        type: 'error',
        errorCode: 'url_not_allowed',
        message:
          redirectCount === 0
            ? 'The URL points to a local, private, or reserved address, which is not allowed.'
            : 'The URL redirected to a local, private, or reserved address, which is not allowed.',
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
      if (findCause(error, DownloadError.isInstance) !== undefined) {
        return {
          type: 'error',
          errorCode: 'url_not_allowed',
          message:
            'The URL resolves to a private or reserved address, which is not allowed.',
        };
      }

      return {
        type: 'error',
        errorCode: 'network_error',
        message: `The request failed${formatErrorCode(error)}.`,
      };
    }

    if (response.type === 'opaqueredirect') {
      return {
        type: 'error',
        errorCode: 'network_error',
        message: 'A redirect could not be validated and was blocked.',
      };
    }

    const location = response.headers.get('location');
    if (REDIRECT_STATUS_CODES.has(response.status) && location) {
      void cancelResponseBody(response);
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return {
          type: 'error',
          errorCode: 'network_error',
          message: 'The server returned an invalid redirect location.',
        };
      }
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
          ? `The request was blocked by bot protection (HTTP ${response.status}).`
          : `The request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`,
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
          message: `The response exceeds the maximum size of ${maxBytes} bytes.`,
        };
      }

      return {
        type: 'error',
        errorCode: 'network_error',
        message: `Reading the response failed${formatErrorCode(error)}.`,
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
    message: `The URL exceeded the maximum of ${MAX_REDIRECTS} redirects.`,
  };
}
