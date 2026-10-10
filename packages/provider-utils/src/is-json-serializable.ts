import type { JSONValue } from '@ai-sdk/provider';

/**
 * Checks whether a value can cross a workflow serialization boundary.
 *
 * The check accepts JSON-like primitives, arrays, and plain objects whose
 * nested values are also serializable. It rejects functions, symbols,
 * bigints, and non-plain objects such as class instances, dates, and regexes.
 */
export function isJSONSerializable(value: unknown): value is JSONValue {
  return isJSONSerializableWithAncestry(value, new WeakSet());
}

function isJSONSerializableWithAncestry(
  value: unknown,
  ancestry: WeakSet<object>,
): value is JSONValue {
  if (value === null || value === undefined) return true;

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'function' || type === 'symbol' || type === 'bigint')
    return false;

  if (Array.isArray(value)) {
    return isSerializableContainer(value, ancestry, () =>
      value.every(item => isJSONSerializableWithAncestry(item, ancestry)),
    );
  }

  if (Object.getPrototypeOf(value) === Object.prototype) {
    return isSerializableContainer(value as object, ancestry, () =>
      Object.values(value as Record<string, unknown>).every(item =>
        isJSONSerializableWithAncestry(item, ancestry),
      ),
    );
  }

  return false;
}

function isSerializableContainer(
  value: object,
  ancestry: WeakSet<object>,
  checkValues: () => boolean,
): boolean {
  if (ancestry.has(value)) {
    return false;
  }

  ancestry.add(value);
  try {
    return checkValues();
  } finally {
    ancestry.delete(value);
  }
}
