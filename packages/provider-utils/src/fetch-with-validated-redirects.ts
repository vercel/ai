import { cancelResponseBody } from './cancel-response-body';
import { DownloadError } from './download-error';
import type { FetchFunction } from './fetch-function';
import { isBrowserRuntime } from './is-browser-runtime';
import { isSameOrigin } from './is-same-origin';
import { getDefaultDownloadFetch } from './safe-node-fetch';
import { validateDownloadUrl } from './validate-download-url';

const MAX_DOWNLOAD_REDIRECTS = 10;

async function getValidatedFetch(
  customFetch: FetchFunction | undefined,
): Promise<FetchFunction> {
  // Callers commonly pass globalThis.fetch through several abstraction
  // layers. Preserve the DNS-pinned Node.js default in that case rather than
  // accidentally treating it as an intentionally custom fetch.
  return customFetch == null || customFetch === globalThis.fetch
    ? await getDefaultDownloadFetch()
    : customFetch;
}

/**
 * Fetches one validated URL without following redirects.
 *
 * On Node.js, the default fetch validates and pins DNS results at connect time.
 * An injected fetch is responsible for equivalent connect-time validation.
 * Redirects are rejected by default. Callers using `redirect: 'manual'` must
 * validate the Location target before issuing another request.
 */
export async function fetchWithValidatedEndpoint({
  url,
  init,
  fetch: customFetch,
  trustedOrigin,
  redirect = 'error',
}: {
  url: string | URL;
  init?: RequestInit;
  fetch?: FetchFunction;
  /**
   * A developer-configured origin that may legitimately resolve to a private
   * address. This must never be derived from untrusted response data.
   */
  trustedOrigin?: string;
  redirect?: 'error' | 'manual';
}): Promise<Response> {
  const urlText = url.toString();
  const isTrusted =
    trustedOrigin !== undefined && isSameOrigin(urlText, trustedOrigin);

  if (!isTrusted) {
    validateDownloadUrl(urlText);
  }

  const fetch =
    isTrusted && customFetch != null
      ? customFetch
      : isTrusted
        ? globalThis.fetch
        : await getValidatedFetch(customFetch);

  return await fetch(url, {
    ...init,
    redirect,
  });
}

/**
 * Fetches a URL while enforcing the SSRF download guard on every hop.
 *
 * Redirects are followed manually (`redirect: 'manual'`) so each hop is
 * validated with {@link validateDownloadUrl} *before* it is requested. Relying
 * on the default `redirect: 'follow'` would issue the request to a redirect
 * target (e.g. an internal address) before we ever see its URL, defeating the
 * SSRF guard.
 *
 * A `redirect: 'manual'` request yields an unreadable opaque response in the
 * browser (and in other spec-compliant fetch implementations), so the redirect
 * target cannot be validated here. In a real browser this is safe to follow
 * natively because SSRF is not reachable (fetch is constrained by CORS and
 * cannot reach a server's internal network or cloud-metadata). On any other
 * runtime we cannot validate the hop, so we fail closed rather than follow it
 * blindly and bypass the SSRF guard.
 *
 * A hop that is same-origin with `trustedOrigin` (the developer-configured
 * endpoint) skips target validation: that origin is exactly what an
 * unvalidated, config-derived request would fetch anyway, and validating it
 * would break legitimate self-hosted / localhost deployments whose response
 * URLs point back at the configured host. Hops on any other origin are always
 * validated.
 *
 * The returned response is the final (non-redirect) response. The caller is
 * responsible for checking `response.ok` and reading the body.
 *
 * On Node.js, the default fetch resolves every hostname through a validating
 * lookup hook and passes those exact addresses to the connector, preventing
 * hostname-to-private-IP and DNS-rebinding bypasses. Other runtimes should
 * constrain egress at the network layer when handling untrusted URLs.
 *
 * @throws DownloadError if a hop is unsafe, the redirect limit is exceeded, or
 * a redirect cannot be validated on a non-browser runtime.
 */
export async function fetchWithValidatedRedirects({
  url,
  headers,
  abortSignal,
  maxRedirects = MAX_DOWNLOAD_REDIRECTS,
  fetch: customFetch,
  trustedOrigin,
}: {
  url: string;
  headers?: HeadersInit;
  abortSignal?: AbortSignal;
  maxRedirects?: number;
  fetch?: FetchFunction;
  /**
   * A developer-configured origin whose hops skip target validation. Must
   * never be derived from response data.
   */
  trustedOrigin?: string;
}): Promise<Response> {
  // Per-hop request options. Only the `redirect` mode varies between hops, so
  // the rest is assembled once. `headers` is omitted entirely when not provided
  // so callers that send none issue a bare request.
  const baseInit: RequestInit = { signal: abortSignal };
  if (headers !== undefined) {
    baseInit.headers = headers;
  }

  let currentUrl = url;
  // The bound also acts as a backstop against an unterminated redirect chain.
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    // The developer-configured origin is trusted by definition; validating it
    // would reject legitimate self-hosted / localhost deployments.
    const isTrustedHop =
      trustedOrigin !== undefined && isSameOrigin(currentUrl, trustedOrigin);

    if (!isTrustedHop) {
      validateDownloadUrl(currentUrl);
    }

    const fetch =
      isTrustedHop && customFetch != null
        ? customFetch
        : isTrustedHop
          ? globalThis.fetch
          : await getValidatedFetch(customFetch);

    const response = await fetch(currentUrl, {
      ...baseInit,
      redirect: 'manual',
    });

    if (response.type === 'opaqueredirect') {
      if (!isBrowserRuntime()) {
        throw new DownloadError({
          url,
          message: `Redirect from ${currentUrl} could not be validated and was blocked`,
        });
      }
      return await fetch(currentUrl, { ...baseInit, redirect: 'follow' });
    }

    const location = response.headers?.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      // Release the redirect response's connection before moving to the next
      // hop. Whether that hop is followed or rejected by the SSRF guard, an
      // unconsumed 3xx body would leak the underlying socket.
      await cancelResponseBody(response);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new DownloadError({
    url,
    message: `Too many redirects (max ${maxRedirects})`,
  });
}
