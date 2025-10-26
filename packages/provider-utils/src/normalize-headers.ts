/**
 * Normalizes different header inputs into a plain record with lower-case keys.
 * Entries with `undefined` or `null` values are removed.
 *
 * @param headers - Input headers (`Headers`, tuples array, plain record) to normalize.
 * @returns A record containing the normalized header entries.
 */
export function normalizeHeaders(
  headers: HeadersInit | Record<string, string | undefined> | undefined,
): Record<string, string> {
  if (headers === undefined || headers === null) {
    return {};
  }

  const normalized: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (value !== undefined && value !== null) {
        normalized[key.toLowerCase()] = value;
      }
    }
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) {
      normalized[key.toLowerCase()] = value;
    }
  }

  return normalized;
}
