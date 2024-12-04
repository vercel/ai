/**
 * A type that can be resolved to a value.
 * The resolved value cannot be a function.
 *
 * 4 variants are possible:
 * - T: Raw value
 * - Promise<T>: Promise of value
 * - (() => T): Function returning value
 * - (() => Promise<T>): Function returning promise of value
 */
export type Resolvable<T extends object> =
  | T
  | Promise<T>
  | (() => T)
  | (() => Promise<T>);

/**
 * Resolves a value that could be a raw value, a Promise, a function returning a value,
 * or a function returning a Promise.
 */
export async function resolve<T extends object>(
  value: Resolvable<T>,
): Promise<T> {
  if (typeof value === 'function') {
    value = value();
  }
  return Promise.resolve(value);
}
