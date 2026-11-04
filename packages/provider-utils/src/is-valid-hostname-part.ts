/**
 * Checks whether a value is a valid ASCII hostname part: 1–63 letters, digits,
 * or hyphens, without a leading or trailing hyphen.
 *
 * Use this before inserting a resource name, region, or location into a
 * generated hostname. Rejects values such as `evil.example.com/#` and
 * `user@localhost:8080/#` that could change the request destination.
 */
export function isValidHostnamePart(value: string): boolean {
  // Compare the full match because `$` also matches before a final newline.
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.exec(value)?.[0] === value;
}
