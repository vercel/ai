import type { JSONValue } from '@ai-sdk/provider';

const invalid = Symbol('invalid');

/**
 * Validates that a value is a JSON value: `null`, a string, a finite number, a
 * boolean, an array of JSON values, or a plain object with JSON values.
 *
 * The value is validated in a single pass that does not allocate memory for
 * its valid parts, so that validating untrusted input costs little more than
 * the input itself. A recursive union schema tries (and reports the issues of)
 * every alternative for every nested value and returns a copy of the value.
 *
 * It accepts the same values as a record schema of JSON values, except that a
 * JSON value cannot contain itself:
 *
 * - Object properties can be `undefined`. Array elements cannot.
 * - Objects must be plain objects without enumerable symbol keys.
 * - Own `__proto__` keys are removed. Only the objects with such a key and the
 *   arrays and objects that contain them are copied. Everything else is
 *   returned as is.
 *
 * @returns The JSON value, or the path to the first invalid value.
 */
export function normalizeJsonValue(
  value: unknown,
):
  | { success: true; value: JSONValue }
  | { success: false; path: PropertyKey[] } {
  const path: PropertyKey[] = [];
  const normalized = normalize(value, path, new Set());

  return normalized === invalid
    ? { success: false, path }
    : { success: true, value: normalized as JSONValue };
}

/**
 * Returns the normalized value, or `invalid` with the path to the invalid
 * value in `path`.
 *
 * @param ancestors - The arrays and objects that contain `value`. Tracking
 * them instead of all visited values detects cycles with memory proportional
 * to the nesting depth.
 */
function normalize(
  value: unknown,
  path: PropertyKey[],
  ancestors: Set<object>,
): unknown {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : invalid;
    case 'object': {
      if (value === null) return value;
      if (ancestors.has(value)) return invalid;

      ancestors.add(value);
      const normalized = Array.isArray(value)
        ? normalizeArray(value, path, ancestors)
        : normalizeObject(value as Record<string, unknown>, path, ancestors);
      ancestors.delete(value);

      return normalized;
    }
    default:
      // undefined, bigint, symbol, function
      return invalid;
  }
}

function normalizeArray(
  array: unknown[],
  path: PropertyKey[],
  ancestors: Set<object>,
): unknown {
  let copy: unknown[] | undefined;

  for (let index = 0; index < array.length; index++) {
    const element = array[index];

    path.push(index);
    const normalized = normalize(element, path, ancestors);
    if (normalized === invalid) return invalid;
    path.pop();

    if (copy != null) {
      copy.push(normalized);
    } else if (normalized !== element) {
      copy = array.slice(0, index);
      copy.push(normalized);
    }
  }

  return copy ?? array;
}

function normalizeObject(
  object: Record<string, unknown>,
  path: PropertyKey[],
  ancestors: Set<object>,
): unknown {
  if (!isPlainObject(object) || hasEnumerableSymbolKey(object)) return invalid;

  const keys = Object.keys(object);
  let copy: Record<string, unknown> | undefined;

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];

    // Assigning the properties of an object with an own `__proto__` key to
    // another object would replace the prototype of that object:
    if (key === '__proto__') {
      copy ??= copyProperties(object, keys, index);
      continue;
    }

    const property = object[key];
    let normalized = property;

    if (property !== undefined) {
      path.push(key);
      normalized = normalize(property, path, ancestors);
      if (normalized === invalid) return invalid;
      path.pop();
    }

    if (copy != null) {
      copy[key] = normalized;
    } else if (normalized !== property) {
      copy = copyProperties(object, keys, index);
      copy[key] = normalized;
    }
  }

  return copy ?? object;
}

/**
 * Copies the properties of the first `count` keys, which are known to be valid.
 */
function copyProperties(
  object: Record<string, unknown>,
  keys: string[],
  count: number,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (let index = 0; index < count; index++) {
    copy[keys[index]] = object[keys[index]];
  }
  return copy;
}

/**
 * Same check as record schemas, which accepts plain objects from other realms
 * and objects without a prototype.
 */
function isPlainObject(object: object): boolean {
  const constructor: unknown = (object as { constructor?: unknown })
    .constructor;
  if (typeof constructor !== 'function') return true;

  const prototype: unknown = constructor.prototype;
  return (
    prototype !== null &&
    typeof prototype === 'object' &&
    Object.prototype.hasOwnProperty.call(prototype, 'isPrototypeOf')
  );
}

function hasEnumerableSymbolKey(object: object): boolean {
  const symbols = Object.getOwnPropertySymbols(object);
  for (let index = 0; index < symbols.length; index++) {
    if (Object.prototype.propertyIsEnumerable.call(object, symbols[index])) {
      return true;
    }
  }
  return false;
}
