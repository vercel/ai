// OpenAI structured outputs rejects JSON Schema `pattern` values that contain
// regex features it does not support (e.g. lookaheads). zod v4's toJSONSchema()
// emits `pattern` for string validators like z.email(), z.uuid(), z.iso.date().
// Strip the keyword recursively before sending schemas to the Responses API.
export function removePatternKeyword(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(removePatternKeyword);

  const result = { ...(schema as Record<string, unknown>) };
  delete result['pattern'];

  for (const key of Object.keys(result)) {
    if (result[key] && typeof result[key] === 'object') {
      result[key] = removePatternKeyword(result[key]);
    }
  }

  return result;
}
