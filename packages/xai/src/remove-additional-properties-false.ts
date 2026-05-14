export function removeAdditionalPropertiesFalse(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(removeAdditionalPropertiesFalse);
  }

  if (schema == null || typeof schema !== 'object') {
    return schema;
  }

  return Object.fromEntries(
    Object.entries(schema)
      .filter(
        ([key, value]) => key !== 'additionalProperties' || value !== false,
      )
      .map(([key, value]) => [key, removeAdditionalPropertiesFalse(value)]),
  );
}
