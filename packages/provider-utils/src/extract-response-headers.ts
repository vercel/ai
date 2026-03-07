const FORBIDDEN_HEADER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Extracts the headers from a response object and returns them as a key-value object.
 *
 * @param response - The response object to extract headers from.
 * @returns The headers as a key-value object.
 */
export function extractResponseHeaders(
  response: Response,
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  response.headers.forEach((value, key) => {
    if (!FORBIDDEN_HEADER_KEYS.has(key)) {
      result[key] = value;
    }
  });
  return result;
}
