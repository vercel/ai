/**
 * Checks whether a value is a single ASCII DNS label: 1–63 letters, digits,
 * or hyphens, without a leading or trailing hyphen.
 *
 * Use this before inserting a resource name, region, or location into a
 * generated hostname. Rejecting dots and URL delimiters prevents the value
 * from changing the intended destination. This does not check whether the
 * resource or region exists, or validate an entire hostname or URL.
 */
export function isValidDnsLabel(value: string): boolean {
  // Compare the full match because `$` also matches before a final newline.
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.exec(value)?.[0] === value;
}
