/**
 * Returns an object-like value as a record, or `undefined` for primitives and arrays.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
