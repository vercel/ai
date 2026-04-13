/**
 * Recursively removes JSON Schema keywords that are not supported by
 * Anthropic's `output_config.format.schema`.
 *
 * Anthropic strictly validates schemas passed via structured outputs
 * (unlike tool schemas where unsupported keywords are silently ignored).
 * This function strips validation-only keywords such as `exclusiveMinimum`,
 * `minimum`, `maximum`, `not`, `pattern`, etc., while preserving structural
 * and composition keywords.
 */

const SUPPORTED_KEYWORDS = new Set([
  // meta-schema
  '$schema',

  // structural
  'type',
  'properties',
  'required',
  'items',
  'additionalProperties',
  '$ref',
  '$defs',
  'definitions',

  // composition
  'anyOf',
  'oneOf',
  'allOf',

  // metadata
  'description',
  'title',
  'default',
  'enum',
  'const',

  // nullable pattern
  'nullable',
]);

export function sanitizeJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeNode(schema);
}

function sanitizeNode(node: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      continue;
    }

    if (key === 'properties' && isPlainObject(value)) {
      const sanitized: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value)) {
        sanitized[propKey] = isPlainObject(propValue)
          ? sanitizeNode(propValue as Record<string, unknown>)
          : propValue;
      }
      result[key] = sanitized;
    } else if (key === 'items' && isPlainObject(value)) {
      result[key] = sanitizeNode(value as Record<string, unknown>);
    } else if (key === 'additionalProperties' && isPlainObject(value)) {
      result[key] = sanitizeNode(value as Record<string, unknown>);
    } else if (
      (key === 'anyOf' || key === 'oneOf' || key === 'allOf') &&
      Array.isArray(value)
    ) {
      result[key] = value.map(item =>
        isPlainObject(item)
          ? sanitizeNode(item as Record<string, unknown>)
          : item,
      );
    } else if (
      (key === '$defs' || key === 'definitions') &&
      isPlainObject(value)
    ) {
      const sanitized: Record<string, unknown> = {};
      for (const [defKey, defValue] of Object.entries(value)) {
        sanitized[defKey] = isPlainObject(defValue)
          ? sanitizeNode(defValue as Record<string, unknown>)
          : defValue;
      }
      result[key] = sanitized;
    } else {
      result[key] = value;
    }
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
