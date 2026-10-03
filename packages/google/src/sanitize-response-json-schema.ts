import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Recursively replaces `const` with a single-value `enum` in the JSON Schema
 * locations supported by Google because `responseJsonSchema` does not support
 * `const`. All other schema properties are preserved.
 */
export function sanitizeResponseJsonSchema(schema: JSONSchema7): JSONSchema7 {
  const {
    const: constValue,
    properties,
    items,
    additionalProperties,
    anyOf,
    oneOf,
    ...result
  } = schema;

  return {
    ...result,
    ...(constValue !== undefined ? { enum: [constValue] } : {}),
    ...(properties != null
      ? { properties: sanitizeDefinitions(properties) }
      : {}),
    ...(items != null
      ? {
          items: Array.isArray(items)
            ? items.map(sanitizeDefinition)
            : sanitizeDefinition(items),
        }
      : {}),
    ...(additionalProperties != null
      ? {
          additionalProperties:
            typeof additionalProperties === 'boolean'
              ? additionalProperties
              : sanitizeDefinition(additionalProperties),
        }
      : {}),
    ...(anyOf != null ? { anyOf: anyOf.map(sanitizeDefinition) } : {}),
    ...(oneOf != null ? { oneOf: oneOf.map(sanitizeDefinition) } : {}),
    ...(result.$defs != null
      ? { $defs: sanitizeDefinitions(result.$defs) }
      : {}),
    ...(result.definitions != null
      ? { definitions: sanitizeDefinitions(result.definitions) }
      : {}),
  };
}

function sanitizeDefinitions(
  definitions: Record<string, JSONSchema7Definition>,
): Record<string, JSONSchema7Definition> {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      sanitizeDefinition(definition),
    ]),
  );
}

function sanitizeDefinition(
  definition: JSONSchema7Definition,
): JSONSchema7Definition {
  return typeof definition === 'boolean'
    ? definition
    : sanitizeResponseJsonSchema(definition);
}
