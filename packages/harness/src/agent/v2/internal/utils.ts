/**
 * Returns whether a value is a plain JSON value: `null`, a string, number or
 * boolean, an array of JSON values, or a plain object whose properties are
 * JSON values or `undefined`. Unlike `isJSONValue`, class instances such as a
 * `Date` and cyclic structures are rejected.
 */
export function isPlainJSONValue(options: {
  /**
   * Value to check.
   */
  value: unknown;

  /**
   * Objects in the current recursion path, used to reject cycles.
   */
  ancestors?: WeakSet<object>;
}): boolean {
  const { value } = options;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value !== 'object') return false;

  const ancestors = options.ancestors ?? new WeakSet<object>();
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every(item => isPlainJSONValue({ value: item, ancestors }));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every(
      item =>
        item === undefined || isPlainJSONValue({ value: item, ancestors }),
    );
  } finally {
    ancestors.delete(value);
  }
}
