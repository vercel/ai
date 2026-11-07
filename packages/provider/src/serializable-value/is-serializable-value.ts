import type { SerializableValue } from './serializable-value';

/**
 * Checks recursively whether a value is composed of supported serializable
 * primitives, built-ins, arrays, maps, sets, or plain objects. Plain objects
 * must contain only string-keyed data properties. Cycles and unsupported class
 * instances are rejected; repeated references without cycles are accepted.
 * Custom serialization protocols are not inspected or invoked.
 */
export function isSerializableValue(
  value: unknown,
): value is SerializableValue {
  return isSerializable({ value, ancestors: new WeakSet() });
}

/**
 * Tracks the current recursion path so shared references are distinguished
 * from cycles. Removing objects on return permits their reuse in other branches.
 */
function isSerializable(input: {
  /**
   * Value to check without applying custom serialization protocols.
   */
  value: unknown;
  /**
   * Objects in the current recursion path.
   */
  ancestors: WeakSet<object>;
}): boolean {
  const { value, ancestors } = input;

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true;
  }

  if (typeof value !== 'object') return false;

  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof URL ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return true;
  }

  if (ancestors.has(value)) return false;
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.every(item => isSerializable({ value: item, ancestors }));
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).every(
        ([key, item]) =>
          isSerializable({ value: key, ancestors }) &&
          isSerializable({ value: item, ancestors }),
      );
    }

    if (value instanceof Set) {
      return Array.from(value.values()).every(item =>
        isSerializable({ value: item, ancestors }),
      );
    }

    const prototype = Object.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      Reflect.ownKeys(value).every(key => {
        if (typeof key !== 'string') return false;

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          descriptor != null &&
          'value' in descriptor &&
          isSerializable({ value: descriptor.value, ancestors })
        );
      })
    );
  } finally {
    ancestors.delete(value);
  }
}
