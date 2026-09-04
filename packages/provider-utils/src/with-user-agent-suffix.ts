import { normalizeHeaders } from './normalize-headers';

/**
 * Sanitizes a User-Agent part to be a valid RFC 9110 token/product.
 *
 * Per RFC 9110 §5.6.2, `product = token ["/" product-version]`, so a single
 * "/" separating a product name from its version is valid and preserved
 * (e.g. `ai-sdk/0.0.0` stays `ai-sdk/0.0.0`). Any additional slashes nested
 * inside the name or version portion are invalid `tchar`s and are replaced
 * with dashes (e.g. `runtime/bun/1.3.9` -> `runtime/bun-1.3.9`, and
 * `ai-sdk/provider-utils/4.0.15` -> `ai-sdk/provider-utils-4.0.15`).
 *
 * If preserving the separator would produce an empty name or version token
 * (e.g. a leading or trailing "/"), all slashes are replaced instead, since
 * an empty token is never valid per `token = 1*tchar` (minimum 1 character).
 */
function normalizeUserAgentPart(part: string): string {
  const slashIndex = part.indexOf('/');
  if (slashIndex === -1) {
    return part;
  }

  const name = part.slice(0, slashIndex);
  const version = part.slice(slashIndex + 1).replace(/\//g, '-');

  if (name.length === 0 || version.length === 0) {
    return part.replace(/\//g, '-');
  }

  return `${name}/${version}`;
}

/**
 * Appends suffix parts to the `user-agent` header.
 * If a `user-agent` header already exists, the suffix parts are appended to it.
 * If no `user-agent` header exists, a new one is created with the suffix parts.
 * Automatically removes undefined entries from the headers.
 * Suffix parts are sanitized to produce valid RFC 9110 tokens.
 *
 * @param headers - The original headers.
 * @param userAgentSuffixParts - The parts to append to the `user-agent` header.
 * @returns The new headers with the `user-agent` header set or updated.
 */
export function withUserAgentSuffix(
  headers: HeadersInit | Record<string, string | undefined> | undefined,
  ...userAgentSuffixParts: string[]
): Record<string, string> {
  const normalizedHeaders = new Headers(normalizeHeaders(headers));

  const currentUserAgentHeader = normalizedHeaders.get('user-agent') || '';

  normalizedHeaders.set(
    'user-agent',
    [
      currentUserAgentHeader,
      ...userAgentSuffixParts.map(normalizeUserAgentPart),
    ]
      .filter(Boolean)
      .join(' '),
  );

  return Object.fromEntries(normalizedHeaders.entries());
}
