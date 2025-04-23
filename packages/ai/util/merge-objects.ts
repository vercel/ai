/**
 * Deeply merges two objects together.
 * - Properties from the second object override those in the first object with the same key
 * - For nested objects, the merge is performed recursively (deep merge)
 * - Arrays are replaced, not merged
 * - Primitive values are replaced
 * - If both inputs are undefined, returns undefined
 * - If one input is undefined, returns the other
 *
 * @param target The target object to merge into
 * @param source The source object to merge from
 * @returns A new object with the merged properties, or undefined if both inputs are undefined
 */
export function mergeObjects<T extends object, U extends object>(
  target: T | undefined,
  source: U | undefined,
): (T & U) | T | U | undefined {
  // If both inputs are undefined, return undefined
  if (target === undefined && source === undefined) {
    return undefined;
  }

  // If target is undefined, return source
  if (target === undefined) {
    return source;
  }

  // If source is undefined, return target
  if (source === undefined) {
    return target;
  }

  // Create a new object to avoid mutating the inputs
  const result = { ...target } as T & U;

  // Iterate through all keys in the source object
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];

      // Skip if the source value is undefined
      if (sourceValue === undefined) continue;

      // Get the target value if it exists
      const targetValue =
        key in target ? target[key as unknown as keyof T] : undefined;

      // Check if both values are objects that can be deeply merged
      const isSourceObject =
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        !(sourceValue instanceof Date) &&
        !(sourceValue instanceof RegExp);

      const isTargetObject =
        targetValue !== null &&
        targetValue !== undefined &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue) &&
        !(targetValue instanceof Date) &&
        !(targetValue instanceof RegExp);

      // If both values are mergeable objects, merge them recursively
      if (isSourceObject && isTargetObject) {
        result[key as keyof (T & U)] = mergeObjects(
          targetValue as object,
          sourceValue as object,
        ) as any;
      } else {
        // For primitives, arrays, or when one value is not a mergeable object,
        // simply override with the source value
        result[key as keyof (T & U)] = sourceValue as any;
      }
    }
  }

  return result;
}
