export function removeUnsupportedXaiSchemaProperties(schema: unknown): unknown {
  if (schema == null || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(removeUnsupportedXaiSchemaProperties);
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties' && value === false) {
      continue;
    }

    result[key] = removeUnsupportedXaiSchemaProperties(value);
  }

  return result;
}
