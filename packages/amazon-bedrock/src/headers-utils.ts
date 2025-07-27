/**
 * Extract headers from a `HeadersInit` object and convert them to a record of
 * lowercase keys and (preserving original case) values.
 * @param headers - The `HeadersInit` object to extract headers from.
 * @returns A record of lowercase keys and (preserving original case) values.
 */
export function extractHeaders(
  headers: HeadersInit | undefined,
): Record<string, string | undefined> {
  let originalHeaders: Record<string, string | undefined> = {};
  if (headers) {
    if (headers instanceof Headers) {
      originalHeaders = convertHeadersToRecord(headers);
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) {
        originalHeaders[k.toLowerCase()] = v;
      }
    } else {
      originalHeaders = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
      ) as Record<string, string>;
    }
  }
  return originalHeaders;
}

/**
 * Convert a Headers object to a record of lowercase keys and (preserving
 * original case) values.
 * @param headers - The Headers object to convert.
 * @returns A record of lowercase keys and values.
 */
export function convertHeadersToRecord(headers: Headers) {
  return Object.fromEntries<string>([...headers]);
}
