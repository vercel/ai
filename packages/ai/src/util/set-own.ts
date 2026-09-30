/**
 * Writes an enumerable own property without invoking inherited setters such as
 * `Object.prototype.__proto__`. Keeps the target object's prototype unchanged.
 */
export function setOwn<T>(
  object: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}
