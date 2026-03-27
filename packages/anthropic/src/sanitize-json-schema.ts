import { JSONSchema7 } from 'json-schema';

/**
 * JSON Schema validation properties that Anthropic's API does not support.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/structured-output
 */
const UNSUPPORTED_PROPERTIES = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
]);

/**
 * Recursively strip JSON Schema validation properties that are not supported
 * by the Anthropic API. The original schema object is not mutated; a new
 * schema object is returned with the unsupported properties removed.
 */
export function sanitizeJsonSchema(schema: JSONSchema7): JSONSchema7 {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_PROPERTIES.has(key)) {
      continue;
    }

    if (key === 'properties' && typeof value === 'object' && value !== null) {
      const sanitizedProperties: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value)) {
        sanitizedProperties[propKey] = sanitizeJsonSchema(
          propValue as JSONSchema7,
        );
      }
      result[key] = sanitizedProperties;
    } else if (key === 'items') {
      if (Array.isArray(value)) {
        result[key] = value.map(item =>
          sanitizeJsonSchema(item as JSONSchema7),
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeJsonSchema(value as JSONSchema7);
      } else {
        result[key] = value;
      }
    } else if (key === 'allOf' || key === 'anyOf' || key === 'oneOf') {
      if (Array.isArray(value)) {
        result[key] = value.map(item =>
          sanitizeJsonSchema(item as JSONSchema7),
        );
      } else {
        result[key] = value;
      }
    } else if (key === 'not' && typeof value === 'object' && value !== null) {
      result[key] = sanitizeJsonSchema(value as JSONSchema7);
    } else if (
      key === 'additionalProperties' &&
      typeof value === 'object' &&
      value !== null
    ) {
      result[key] = sanitizeJsonSchema(value as JSONSchema7);
    } else {
      result[key] = value;
    }
  }

  return result as JSONSchema7;
}
