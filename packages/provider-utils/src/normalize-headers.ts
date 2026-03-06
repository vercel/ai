// Reject header names or values containing CRLF characters to prevent header injection
const HEADER_INJECTION_RE = /[\r\n]/;

function validateHeaderEntry(key: string, value: string): void {
  if (HEADER_INJECTION_RE.test(key) || HEADER_INJECTION_RE.test(value)) {
    throw new Error(
      `Invalid header: header names and values must not contain CR or LF characters`,
    );
  }
}

/**
 * Normalizes different header inputs into a plain record with lower-case keys.
 * Entries with `undefined` or `null` values are removed.
 * Rejects header names/values containing CRLF characters to prevent header injection.
 *
 * @param headers - Input headers (`Headers`, tuples array, plain record) to normalize.
 * @returns A record containing the normalized header entries.
 */
export function normalizeHeaders(
  headers:
    | HeadersInit
    | Record<string, string | undefined>
    | Array<[string, string | undefined]>
    | undefined,
): Record<string, string> {
  if (headers == null) {
    return {};
  }

  const normalized: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
  } else {
    if (!Array.isArray(headers)) {
      headers = Object.entries(headers);
    }

    for (const [key, value] of headers) {
      if (value != null) {
        validateHeaderEntry(key, value);
        normalized[key.toLowerCase()] = value;
      }
    }
  }

  return normalized;
}
