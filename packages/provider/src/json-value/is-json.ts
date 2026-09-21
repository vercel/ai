import type { JSONArray, JSONObject, JSONValue } from './json-value';

export function isPlainObject(value: unknown): value is JSONObject {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}

export function isJSONValue(value: unknown): value is JSONValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJSONValue);
  }

  if (isPlainObject(value)) {
    return Object.entries(value).every(
      ([key, val]) =>
        typeof key === 'string' && (val === undefined || isJSONValue(val)),
    );
  }

  return false;
}

export function isJSONArray(value: unknown): value is JSONArray {
  return Array.isArray(value) && value.every(isJSONValue);
}

export function isJSONObject(value: unknown): value is JSONObject {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(
      ([key, val]) =>
        typeof key === 'string' && (val === undefined || isJSONValue(val)),
    )
  );
}
