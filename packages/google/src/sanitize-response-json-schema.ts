import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Recursively replaces `const` with a single-value `enum` in the JSON Schema
 * locations supported by Google because `responseJsonSchema` does not support
 * `const`. All other schema properties are preserved.
 */
export function sanitizeResponseJsonSchema(
  schema: JSONSchema7,
  seen = new Map<JSONSchema7, JSONSchema7>(),
): JSONSchema7 {
  const cached = seen.get(schema);
  if (cached != null) {
    return cached;
  }

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

  // Cache the sanitized object before recursing so that shared and circular
  // subschemas resolve to the sanitized result instead of the original schema.
  const sanitized: JSONSchema7 = {
    ...result,
    ...(constValue !== undefined ? { enum: [constValue] } : {}),
  };
  seen.set(schema, sanitized);

  if (properties != null) {
    sanitized.properties = sanitizeDefinitions(properties, seen);
  }
  if (items != null) {
    sanitized.items = Array.isArray(items)
      ? items.map(item => sanitizeDefinition(item, seen))
      : sanitizeDefinition(items, seen);
  }
  if (additionalProperties != null) {
    sanitized.additionalProperties =
      typeof additionalProperties === 'boolean'
        ? additionalProperties
        : sanitizeDefinition(additionalProperties, seen);
  }
  if (anyOf != null) {
    sanitized.anyOf = anyOf.map(def => sanitizeDefinition(def, seen));
  }
  if (oneOf != null) {
    sanitized.oneOf = oneOf.map(def => sanitizeDefinition(def, seen));
  }
  if (allOf != null) {
    sanitized.allOf = allOf.map(def => sanitizeDefinition(def, seen));
  }
  if (definitions != null) {
    sanitized.definitions = sanitizeDefinitions(definitions, seen);
  }
  if (schemaWithDefs.$defs != null) {
    (sanitized as typeof schemaWithDefs).$defs = sanitizeDefinitions(
      schemaWithDefs.$defs,
      seen,
    );
  }

  return sanitized;
}

function sanitizeDefinitions(
  definitions: Record<string, JSONSchema7Definition>,
  seen: Map<JSONSchema7, JSONSchema7>,
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
  seen: Map<JSONSchema7, JSONSchema7>,
): JSONSchema7Definition {
  return typeof definition === 'boolean'
    ? definition
    : sanitizeResponseJsonSchema(definition, seen);
}
