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

/**
 * Encodes a multi-segment resource path (e.g. `operations/abc` or
 * `batches/123`) by encoding each `/`-separated segment with
 * {@link encodePathSegment}. Preserves the structure of a legitimate
 * provider-returned resource name while neutralizing traversal (`.`, `..`, and
 * encoded slashes) inside any segment.
 */
export function encodePathSegments(value: string): string {
  return value.split('/').map(encodePathSegment).join('/');
}
