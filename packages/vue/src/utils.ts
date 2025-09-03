import { isProxy, isReactive, isRef, toRaw } from 'vue';

/**
 * Converts a reactive object to a plain object.
 */
export function deepToRaw<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map(item => deepToRaw(item)) as unknown as T;
  } else if (isRef(input) || isReactive(input) || isProxy(input)) {
    return deepToRaw(toRaw(input));
  } else if (input && typeof input === 'object') {
    return Object.keys(input).reduce((acc, key) => {
      (acc as any)[key] = deepToRaw((input as any)[key]);
      return acc;
    }, {} as T);
  }
  return input;
}
