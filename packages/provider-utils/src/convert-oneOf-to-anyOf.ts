import { JSONSchema7 } from '@ai-sdk/provider';

/**
 * Recursively converts all `oneOf` keywords to `anyOf` in a JSON Schema.
 *
 * Anthropic's API does not support `oneOf` in JSON schemas (used for
 * structured output and tool input schemas). Zod's `discriminatedUnion`
 * generates `oneOf`, so we convert it to the semantically equivalent
 * `anyOf` which Anthropic does support.
 */
export function convertOneOfToAnyOf(schema: JSONSchema7): JSONSchema7 {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'oneOf' && Array.isArray(value)) {
      result['anyOf'] = value.map(item =>
        typeof item === 'object' && item !== null
          ? convertOneOfToAnyOf(item as JSONSchema7)
          : item,
      );
    } else if (
      key === 'properties' &&
      typeof value === 'object' &&
      value !== null
    ) {
      const converted: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value)) {
        converted[propKey] =
          typeof propValue === 'object' && propValue !== null
            ? convertOneOfToAnyOf(propValue as JSONSchema7)
            : propValue;
      }
      result[key] = converted;
    } else if (key === 'items') {
      result[key] =
        typeof value === 'object' && value !== null
          ? convertOneOfToAnyOf(value as JSONSchema7)
          : value;
    } else if (key === 'anyOf' && Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? convertOneOfToAnyOf(item as JSONSchema7)
          : item,
      );
    } else if (key === '$defs' && typeof value === 'object' && value !== null) {
      const converted: Record<string, unknown> = {};
      for (const [defKey, defValue] of Object.entries(value)) {
        converted[defKey] =
          typeof defValue === 'object' && defValue !== null
            ? convertOneOfToAnyOf(defValue as JSONSchema7)
            : defValue;
      }
      result[key] = converted;
    } else if (key === 'allOf' && Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? convertOneOfToAnyOf(item as JSONSchema7)
          : item,
      );
    } else if (
      key === 'definitions' &&
      typeof value === 'object' &&
      value !== null
    ) {
      const converted: Record<string, unknown> = {};
      for (const [defKey, defValue] of Object.entries(value)) {
        converted[defKey] =
          typeof defValue === 'object' && defValue !== null
            ? convertOneOfToAnyOf(defValue as JSONSchema7)
            : defValue;
      }
      result[key] = converted;
    } else if (
      (key === 'not' ||
        key === 'if' ||
        key === 'then' ||
        key === 'else' ||
        key === 'contains' ||
        key === 'additionalProperties') &&
      typeof value === 'object' &&
      value !== null
    ) {
      result[key] = convertOneOfToAnyOf(value as JSONSchema7);
    } else {
      result[key] = value;
    }
  }

  return result as JSONSchema7;
}
