export type Resolvable<T> =
  | T // Raw value
  | Promise<T> // Promise of value
  | (() => T) // Function returning value
  | (() => Promise<T>); // Function returning promise of value

/**
 * Resolves a value that could be a raw value, a Promise, a function returning a value,
 * or a function returning a Promise.
 */
export async function resolve<T>(value: Resolvable<T>): Promise<T> {
  // If it's a function, call it to get the value/promise
  if (typeof value === 'function') {
    value = (value as Function)();
  }

  // Otherwise just resolve whatever we got (value or promise)
  return Promise.resolve(value as T);
}
