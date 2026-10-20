import { fetchWithValidatedRedirects } from './fetch-with-validated-redirects';
import { isSameOrigin } from './is-same-origin';
import { sanitizeRequestHeaders } from './sanitize-request-headers';

// Providers can use arbitrary credential header names. Only established
// non-credential request metadata is safe to forward without an origin assertion.
const SAFE_UNTRUSTED_FIRST_HOP_HEADERS = new Set([
  'accept',
  'accept-language',
  'baggage',
  'cache-control',
  'idempotency-key',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'pragma',
  'range',
  'traceparent',
  'tracestate',
  'user-agent',
  'x-correlation-id',
  'x-request-id',
]);

/**
 * Fetches an untrusted URL with first-hop credential isolation and validated
 * redirects. Uses the URL validation, DNS-pinned Node.js transport, redirect
 * limits, and cross-origin header stripping of {@link fetchWithValidatedRedirects}.
 * An injected fetch must provide equivalent connect-time DNS validation.
 *
 * Without a matching `credentialedOrigin` (or `trustedOrigin` when it is
 * omitted), only allowlisted request metadata is sent on the first hop.
 * Arbitrary caller headers require an explicit matching origin because vendor
 * credential names cannot be inferred safely. Proxy, metadata, cookie, and
 * hop-by-hop headers are sanitized even for a matching origin.
 *
 * `trustedOrigin` also exempts same-origin hops from URL validation, allowing
 * developer-configured private endpoints. Both origin options must come from
 * developer configuration, never from untrusted response data.
 *
 * This is an opt-in alternative to `fetchWithValidatedRedirects`, whose
 * existing first-hop header behavior is preserved for compatibility.
 */
export async function fetchUntrustedUrl({
  headers,
  credentialedOrigin,
  untrustedFirstHopHeaders,
  ...options
}: Parameters<typeof fetchWithValidatedRedirects>[0] & {
  /**
   * The developer-configured origin allowed to receive arbitrary caller
   * headers on the first hop. Defaults to `trustedOrigin` when omitted.
   * An explicit value takes precedence over `trustedOrigin` and does not
   * exempt the URL from validation.
   */
  credentialedOrigin?: string;
  /**
   * Additional sanitized header names safe to disclose to an untrusted first
   * hop. Use only for non-credential protocol metadata. Credentials require
   * a matching `credentialedOrigin` instead. Names are case-insensitive.
   */
  untrustedFirstHopHeaders?: readonly string[];
}): Promise<Response> {
  let firstHopHeaders: Headers | undefined;
  if (headers !== undefined) {
    firstHopHeaders = sanitizeRequestHeaders(headers);
    const origin = credentialedOrigin ?? options.trustedOrigin;

    if (origin === undefined || !isSameOrigin(options.url, origin)) {
      const allowedHeaders = new Set([
        ...SAFE_UNTRUSTED_FIRST_HOP_HEADERS,
        ...(untrustedFirstHopHeaders ?? []).map(name => name.toLowerCase()),
      ]);
      firstHopHeaders = new Headers(
        [...firstHopHeaders].filter(([name]) => allowedHeaders.has(name)),
      );
    }
  }

  return fetchWithValidatedRedirects({
    ...options,
    headers: firstHopHeaders,
  });
}
