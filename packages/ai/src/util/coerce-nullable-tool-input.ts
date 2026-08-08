import type { JSONSchema7 } from '@ai-sdk/provider';

/**
 * When strict: true tool calling is used, some models (e.g. via AI Gateway)
 * omit required nullable fields from generated tool call arguments instead of
 * setting them to null. This utility injects null for any required field that:
 *   - is missing from the model's output, AND
 *   - is nullable according to the JSON schema (type includes "null", or
 *     anyOf contains {type: "null"})
 *
 * This matches the user's intent: the field is required but nullable, so null
 * is always a valid value when the model omits it entirely.
 */
export function coerceNullableToolInput(
  input: Record<string, unknown>,
  schema: JSONSchema7,
): Record<string, unknown> {
  if (schema.type !== 'object' || schema.properties == null) {
    return input;
  }

  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required : [],
  );

  const coerced = { ...input };

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (typeof propSchema === 'boolean') continue;
    if (!(key in coerced) && required.has(key) && isNullable(propSchema)) {
      coerced[key] = null;
    }
  }

  return coerced;
}

function isNullable(schema: JSONSchema7): boolean {
  // type: ["string", "null"] or type: "null"
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    return true;
  }
  if (schema.type === 'null') {
    return true;
  }
  // anyOf: [..., { type: "null" }]
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some(s => typeof s !== 'boolean' && s.type === 'null');
  }
  return false;
}
