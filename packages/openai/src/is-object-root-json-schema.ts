import type { JSONSchema7 } from '@ai-sdk/provider';

/**
 * OpenAI structured outputs require a JSON schema whose root is an object
 * (`type: 'object'`). Other roots are rejected with `invalid_json_schema`.
 *
 * Schemas without an explicit root type are reported as compatible, since they
 * can still describe an object (e.g. through `properties` or a `$ref`).
 */
export function isObjectRootJsonSchema(
  schema: JSONSchema7 | undefined,
): boolean {
  const type = schema?.type;

  if (type == null) {
    return true;
  }

  return Array.isArray(type) ? type.includes('object') : type === 'object';
}
