/**
 * Normalizes different `HeadersInit` inputs into a plain record.
 * Undefined and null values are filtered out.
 */
export function normalizeHeaders(
  headers: HeadersInit | Record<string, string | undefined> | undefined,
): Record<string, string> {
  if (headers === undefined || headers === null) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(
      headers.filter(([_, value]) => value !== undefined && value !== null),
    ) as Record<string, string>;
  }

  if (typeof headers === 'object') {
    return Object.fromEntries(
      Object.entries(headers).filter(
        ([_, value]) => value !== undefined && value !== null,
      ),
    ) as Record<string, string>;
  }

  return {};
}
