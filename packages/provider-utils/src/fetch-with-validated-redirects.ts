import { cancelResponseBody } from './cancel-response-body';
import { DownloadError } from './download-error';
import type { FetchFunction } from './fetch-function';
import { isBrowserRuntime } from './is-browser-runtime';
import { isSameOrigin } from './is-same-origin';
import { getDefaultDownloadFetch } from './safe-node-fetch';
import { sanitizeRequestHeaders } from './sanitize-request-headers';
import { validateDownloadUrl } from './validate-download-url';

const MAX_DOWNLOAD_REDIRECTS = 10;

// Redirect status codes per the fetch spec (https://fetch.spec.whatwg.org/#redirect-status).
// Notably 300 (Multiple Choices) and 304 (Not Modified) are NOT redirects,
// even when a server attaches a Location header.
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches a URL while enforcing the download guard on every hop.
 *
 * Redirects are followed manually (`redirect: 'manual'`) so each hop is
 * validated with {@link validateDownloadUrl} *before* it is requested. Relying
 * on the default `redirect: 'follow'` would issue the request to a redirect
 * target (e.g. an internal address) before we ever see its URL, defeating the
 * guard.
 *
 * Request headers are also protected: {@link sanitizeRequestHeaders} strips
 * proxy/metadata/cookie/hop-by-hop headers before the first request, and all
 * caller headers except `User-Agent` are dropped on a cross-origin redirect.
 * The fetch spec only strips `Authorization` on cross-origin redirects because
 * in a browser, CORS preflighting protects custom headers; there is no CORS on
 * the server, so provider API keys carried in custom headers (e.g. `x-key`)
 * must be dropped here as well.
 *
 * A `redirect: 'manual'` request yields an unreadable opaque response in the
 * browser (and in other spec-compliant fetch implementations), so the redirect
 * target cannot be validated here. In a real browser this is safe to follow
 * natively because reaching an internal network is not possible (fetch is
 * constrained by CORS and cannot reach a server's internal network or
 * cloud-metadata). On any other runtime we cannot validate the hop, so we fail
 * closed rather than follow it blindly and bypass the guard.
 *
 * A hop that is same-origin with `trustedOrigin` (the developer-configured
 * provider endpoint) skips target validation: that origin is exactly what an
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
 * hostname-to-private-IP and DNS-rebinding bypasses. An injected fetch is
 * responsible for equivalent connect-time validation. Other runtimes should
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
   * A developer-configured origin (e.g. the provider's `baseURL`) whose hops
   * skip target validation. Must never be derived from response data.
   */
  trustedOrigin?: string;
}): Promise<Response> {
  // Left undefined when no headers are provided (bare request); otherwise
  // sanitized once and replaced on a cross-origin hop (credential drop below).
  let currentHeaders =
    headers === undefined ? undefined : sanitizeRequestHeaders(headers);

  const perHopInit = (redirect: RequestRedirect): RequestInit => {
    const init: RequestInit = { signal: abortSignal, redirect };
    if (currentHeaders !== undefined) {
      // Snapshot per hop: the platform fetch reads headers synchronously, but
      // an injected fetch may defer, and hops between credential drops would
      // otherwise share one instance.
      init.headers = new Headers(currentHeaders);
    }
    return init;
  };

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
      customFetch ??
      (isTrustedHop ? globalThis.fetch : await getDefaultDownloadFetch());

    const response = await fetch(currentUrl, perHopInit('manual'));

    if (response.type === 'opaqueredirect') {
      if (!isBrowserRuntime()) {
        throw new DownloadError({
          url,
          message: `Redirect from ${currentUrl} could not be validated and was blocked`,
        });
      }
      return await fetch(currentUrl, perHopInit('follow'));
    }

    const location = response.headers.get('location');
    if (REDIRECT_STATUS_CODES.has(response.status) && location) {
      // Release the redirect response's connection before moving to the next
      // hop. Whether that hop is followed or rejected by the guard, an
      // unconsumed 3xx body would leak the underlying socket.
      await cancelResponseBody(response);
      const nextUrl = new URL(location, currentUrl).toString();

      // Drop all caller headers except the user-agent before following a
      // redirect that crosses origin. Only stripping Authorization (as the
      // fetch spec does) is not enough on the server: providers authenticate
      // with custom headers too (e.g. `x-key`), and without CORS there is
      // nothing else stopping them from riding to a foreign host.
      if (currentHeaders !== undefined && !isSameOrigin(nextUrl, currentUrl)) {
        const userAgent = currentHeaders.get('user-agent');
        currentHeaders = new Headers(
          userAgent == null ? undefined : { 'user-agent': userAgent },
        );
      }

      currentUrl = nextUrl;
      continue;
    }

    return response;
  }

  throw new DownloadError({
    url,
    message: `Too many redirects (max ${maxRedirects})`,
  });
}
