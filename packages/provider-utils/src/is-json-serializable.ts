import type { JSONValue } from '@ai-sdk/provider';

/**
 * Checks whether a value can cross a workflow serialization boundary.
 *
 * The check accepts JSON-like primitives, arrays, and plain objects whose
 * nested values are also serializable. It rejects functions, symbols,
 * bigints, and non-plain objects such as class instances, dates, and regexes.
 */
export function isJSONSerializable(value: unknown): value is JSONValue {
  return checkJSONSerializable(value, new Set());
}

function checkJSONSerializable(
  value: unknown,
  ancestors: Set<unknown>,
): boolean {
  if (value === null || value === undefined) return true;

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'function' || type === 'symbol' || type === 'bigint')
    return false;

  if (typeof value === 'object') {
    if (ancestors.has(value)) {
      return false;
    }
  }

  if (Array.isArray(value)) {
    ancestors.add(value);
    const result = value.every(item => checkJSONSerializable(item, ancestors));
    ancestors.delete(value);
    return result;
  }

  if (Object.getPrototypeOf(value) === Object.prototype) {
    ancestors.add(value);
    const result = Object.values(value as Record<string, unknown>).every(item =>
      checkJSONSerializable(item, ancestors),
    );
    ancestors.delete(value);
    return result;
  }

  return false;
}
