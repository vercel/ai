// OpenAI structured outputs rejects JSON Schema `pattern` values that contain
// regex features it does not support (e.g. lookaheads). zod v4's toJSONSchema()
// emits `pattern` for string validators like z.email(), z.uuid(), z.iso.date().
// Strip the keyword recursively before sending schemas to the Responses API.
//
// Only standard JSON Schema structural keys are recursed into, so that tool or
// response parameters whose name happens to be "pattern" are never touched.
export function removePatternKeyword(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(removePatternKeyword);

  const result = { ...(schema as Record<string, unknown>) };

  // Remove the JSON Schema string-validator keyword at this level.
  delete result['pattern'];

  // Keys whose values are { name → schema } maps. Recurse into the schema
  // values but preserve the keys — a key named "pattern" here is a user-
  // defined property name, not the JSON Schema keyword.
  for (const mapKey of ['properties', 'patternProperties', '$defs', 'definitions']) {
    if (
      result[mapKey] &&
      typeof result[mapKey] === 'object' &&
      !Array.isArray(result[mapKey])
    ) {
      result[mapKey] = Object.fromEntries(
        Object.entries(result[mapKey] as Record<string, unknown>).map(
          ([k, v]) => [k, removePatternKeyword(v)],
        ),
      );
    }
  }

  // Keys whose values are sub-schemas or arrays of sub-schemas.
  for (const schemaKey of [
    'items',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'additionalProperties',
    'if',
    'then',
    'else',
  ]) {
    if (result[schemaKey] !== undefined) {
      result[schemaKey] = removePatternKeyword(result[schemaKey]);
    }
  }

  return result;
}
