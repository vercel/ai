import {
  isJSONObject,
  type JSONObject,
  type JSONValue,
} from '@ai-sdk/provider';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import type { JsonValue } from '@earendil-works/pi-ai';

/**
 * Converts a value held by Pi into a plain JSON value, the way
 * `JSON.stringify` serializes it: `undefined` properties are dropped,
 * `toJSON()` is applied, schema metadata stored under symbol keys is removed,
 * and a top-level `undefined` becomes `null`.
 *
 * Values recorded in the log or passed to the drive context must be plain
 * JSON, while Pi's messages and tool results may carry `undefined` fields or
 * TypeBox schemas.
 */
export function toJSONValue(options: {
  /**
   * Value to convert.
   */
  value: unknown;
}): JSONValue {
  const serialized = JSON.stringify(options.value);
  return serialized === undefined ? null : secureJsonParse(serialized);
}

/**
 * Converts an object held by Pi into a plain JSON object, like
 * `toJSONValue()`. Throws when the object does not serialize to a JSON
 * object, e.g. because its `toJSON()` returns another kind of value.
 */
export function toJSONObject(options: {
  /**
   * Object to convert.
   */
  value: object;
}): JSONObject {
  const value = toJSONValue(options);
  if (!isJSONObject(value) || Array.isArray(value)) {
    throw new Error('The value does not serialize to a JSON object.');
  }
  return value;
}

/**
 * Converts a value into a JSON value as Pi's messages type it, like
 * `toJSONValue()`: unlike the AI SDK's JSON values, Pi's JSON objects have
 * no `undefined` properties, which a parsed JSON value never has.
 */
export function toPiJsonValue(options: {
  /**
   * Value to convert.
   */
  value: unknown;
}): JsonValue {
  const serialized = JSON.stringify(options.value);
  return serialized === undefined ? null : secureJsonParse(serialized);
}
