/**
 * Serializes a value as JSON, representing BigInt values as decimal strings and
 * ancestor cycles as "[Circular]". Reused objects, toJSON methods, and other JSON
 * serialization behavior are preserved. Getters and toJSON methods may throw.
 */
export function stringifyWithBigIntAndCycles(value: unknown): string {
  const ancestors: object[] = [];
  return JSON.stringify(value, function (_key, value) {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    // JSON.stringify visits siblings after their previous subtree. Only
    // objects on the current ancestor path are circular references.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) {
      return '[Circular]';
    }
    ancestors.push(value);
    return value;
  });
}
