/**
 * Writes a property by an untrusted key, without going through inherited
 * prototype setters.
 *
 * Lookup tables such as `providerMetadata` are merged by iterating
 * `Object.entries(source)` and writing each entry into an accumulator with
 * `target[key] = value`. If `key` is `__proto__`, plain bracket assignment
 * (`obj[key] = value`) resolves to the inherited `__proto__` accessor on
 * `Object.prototype`, which mutates the object's prototype instead of
 * creating an own property named `__proto__`. This helper always defines an
 * own, writable, enumerable property, so an untrusted key can never do that.
 */
export function setOwn<T extends object>(
  obj: T,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
