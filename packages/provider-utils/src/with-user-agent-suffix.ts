import { normalizeHeaders } from './normalize-headers';

/**
 * Sanitizes a User-Agent part to be a valid RFC 9110 token by replacing
 * slashes with dashes. Runtimes like Bun set navigator.userAgent = "Bun/1.3.9"
 * which would produce an invalid token when embedded in the User-Agent string.
 */
function normalizeUserAgentPart(part: string): string {
  return part.replace(/\//g, '-');
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
    [currentUserAgentHeader, ...userAgentSuffixParts.map(normalizeUserAgentPart)]
      .filter(Boolean)
      .join(' '),
  );

  return Object.fromEntries(normalizedHeaders.entries());
}
