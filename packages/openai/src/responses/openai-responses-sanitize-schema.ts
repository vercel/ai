/**
 * Recursively removes JSON Schema `pattern` keywords before sending schemas
 * to the OpenAI Responses API.
 *
 * zod v4's `toJSONSchema()` emits `pattern` for string-format validators such
 * as `z.email()`, `z.uuid()`, and `z.iso.date()`. Those regexes include
 * features OpenAI rejects (lookaround: "Invalid JSON schema: regex lookaround
 * is not supported") and have also triggered in-stream `server_error`s.
 * `format` is kept so the constraint is still described to the model.
 *
 * A property named `"pattern"` is preserved because its value is a subschema
 * object, not a regex string.
 */
export function removePatternKeyword<T>(schema: T): T {
  if (Array.isArray(schema)) {
    return schema.map(item => removePatternKeyword(item)) as T;
  }

  if (schema == null || typeof schema !== 'object') {
    return schema;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'pattern' && typeof value === 'string') {
      continue;
    }

    result[key] = removePatternKeyword(value);
  }

  return result as T;
}
