import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Recursively replaces `const` with a single-value `enum` in the JSON Schema
 * locations supported by Google because `responseJsonSchema` does not support
 * `const`. All other schema properties are preserved.
 */
export function sanitizeResponseJsonSchema(
  schema: JSONSchema7,
  seen = new Set<JSONSchema7>(),
): JSONSchema7 {
  if (seen.has(schema)) {
    return schema;
  }
  seen.add(schema);

  const {
    const: constValue,
    properties,
    items,
    additionalProperties,
    anyOf,
    oneOf,
    allOf,
    definitions,
    ...result
  } = schema;

  const schemaWithDefs = schema as JSONSchema7 & {
    $defs?: Record<string, JSONSchema7Definition>;
  };

  return {
    ...result,
    ...(constValue !== undefined ? { enum: [constValue] } : {}),
    ...(properties != null
      ? { properties: sanitizeDefinitions(properties, seen) }
      : {}),
    ...(items != null
      ? {
          items: Array.isArray(items)
            ? items.map(item => sanitizeDefinition(item, seen))
            : sanitizeDefinition(items, seen),
        }
      : {}),
    ...(additionalProperties != null
      ? {
          additionalProperties:
            typeof additionalProperties === 'boolean'
              ? additionalProperties
              : sanitizeDefinition(additionalProperties, seen),
        }
      : {}),
    ...(anyOf != null
      ? { anyOf: anyOf.map(def => sanitizeDefinition(def, seen)) }
      : {}),
    ...(oneOf != null
      ? { oneOf: oneOf.map(def => sanitizeDefinition(def, seen)) }
      : {}),
    ...(allOf != null
      ? { allOf: allOf.map(def => sanitizeDefinition(def, seen)) }
      : {}),
    ...(definitions != null
      ? { definitions: sanitizeDefinitions(definitions, seen) }
      : {}),
    ...(schemaWithDefs.$defs != null
      ? { $defs: sanitizeDefinitions(schemaWithDefs.$defs, seen) }
      : {}),
  };
}

function sanitizeDefinitions(
  definitions: Record<string, JSONSchema7Definition>,
  seen: Set<JSONSchema7>,
): Record<string, JSONSchema7Definition> {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      sanitizeDefinition(definition, seen),
    ]),
  );
}

function sanitizeDefinition(
  definition: JSONSchema7Definition,
  seen: Set<JSONSchema7>,
): JSONSchema7Definition {
  return typeof definition === 'boolean'
    ? definition
    : sanitizeResponseJsonSchema(definition, seen);
}
