/**
 * Recursively replaces all `oneOf` keywords with `anyOf` in a JSON Schema
 * object tree.
 *
 * The Anthropic API rejects schemas containing `oneOf`
 * (`output_format.schema: Schema type 'oneOf' is not supported`) but
 * supports `anyOf` for the same use-cases.  Zod's `z.discriminatedUnion()`
 * generates `oneOf` when serialised to JSON Schema, causing failures when
 * that schema is passed to Anthropic as a tool `input_schema` or as an
 * `output_format.schema`.
 *
 * Semantically `oneOf` (exactly-one-of) and `anyOf` (at-least-one-of)
 * differ, but for the discriminated union case — where the variants are
 * mutually exclusive by design — the practical runtime behaviour is
 * identical and Anthropic only supports `anyOf`.
 */
export function replaceOneOfWithAnyOf(schema: unknown): unknown {
  if (schema == null || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(item => replaceOneOfWithAnyOf(item));
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(
    schema as Record<string, unknown>,
  )) {
    if (key === 'oneOf') {
      // Convert oneOf → anyOf and recurse into the sub-schemas.
      result.anyOf = replaceOneOfWithAnyOf(value);
    } else {
      result[key] = replaceOneOfWithAnyOf(value);
    }
  }

  return result;
}
