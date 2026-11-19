/**
 * Encodes a raw identifier as one URL path segment, including standalone dot
 * segments that URL parsers would otherwise normalize. Pass unencoded values;
 * for resource paths with intentional slashes, encode each segment separately.
 */
export function encodePathSegment(value: string): string {
  const encodedValue = encodeURIComponent(value);

  // URL parsing normalizes both literal and percent-encoded dot segments.
  return encodedValue === '.'
    ? '%252E'
    : encodedValue === '..'
      ? '%252E%252E'
      : encodedValue;
}
