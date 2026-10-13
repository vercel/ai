import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * OpenAI does not support `allOf`. Zod 4 uses a singleton `allOf` wrapper for
 * recursive references, which can be rewritten to a direct reference.
 */
export function normalizeOpenAIJsonSchema(schema: JSONSchema7): JSONSchema7 {
  const normalizedSchema = normalizeSchema(schema, true) as JSONSchema7;
  const reference = getSingletonReference(normalizedSchema);

  if (reference == null) {
    return normalizedSchema;
  }

  const { allOf: _allOf, ...schemaWithoutAllOf } = normalizedSchema;
  const referencedSchema = getLocalReferenceSchema(reference, normalizedSchema);

  // OpenAI requires an object at the schema root, so expand local root refs.
  return typeof referencedSchema !== 'object' || referencedSchema == null
    ? normalizedSchema
    : { ...referencedSchema, ...schemaWithoutAllOf };

  function normalizeSchema(
    schema: JSONSchema7Definition,
    isRoot = false,
  ): JSONSchema7Definition {
    if (typeof schema !== 'object' || schema == null) {
      return schema;
    }

    const normalizedSchema: JSONSchema7 = { ...schema };

    if (normalizedSchema.properties != null) {
      normalizedSchema.properties = normalizeSchemaRecord(
        normalizedSchema.properties,
      );
    }

    if (normalizedSchema.patternProperties != null) {
      normalizedSchema.patternProperties = normalizeSchemaRecord(
        normalizedSchema.patternProperties,
      );
    }

    if (normalizedSchema.definitions != null) {
      normalizedSchema.definitions = normalizeSchemaRecord(
        normalizedSchema.definitions,
      );
    }

    if (normalizedSchema.$defs != null) {
      normalizedSchema.$defs = normalizeSchemaRecord(normalizedSchema.$defs);
    }

    if (normalizedSchema.items != null) {
      normalizedSchema.items = Array.isArray(normalizedSchema.items)
        ? normalizedSchema.items.map(item => normalizeSchema(item))
        : normalizeSchema(normalizedSchema.items);
    }

    if (normalizedSchema.allOf != null) {
      normalizedSchema.allOf = normalizedSchema.allOf.map(item =>
        normalizeSchema(item),
      );
    }

    if (normalizedSchema.anyOf != null) {
      normalizedSchema.anyOf = normalizedSchema.anyOf.map(item =>
        normalizeSchema(item),
      );
    }

    if (normalizedSchema.oneOf != null) {
      normalizedSchema.oneOf = normalizedSchema.oneOf.map(item =>
        normalizeSchema(item),
      );
    }

    if (
      typeof normalizedSchema.additionalProperties === 'object' &&
      normalizedSchema.additionalProperties != null
    ) {
      normalizedSchema.additionalProperties = normalizeSchema(
        normalizedSchema.additionalProperties,
      );
    }

    const reference = getSingletonReference(normalizedSchema);

    if (reference == null || isRoot) {
      return normalizedSchema;
    }

    const { allOf: _allOf, ...schemaWithoutAllOf } = normalizedSchema;
    return { ...schemaWithoutAllOf, $ref: reference };
  }

  function normalizeSchemaRecord(
    record: Record<string, JSONSchema7Definition>,
  ): Record<string, JSONSchema7Definition> {
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        normalizeSchema(value),
      ]),
    );
  }

  function getSingletonReference(schema: JSONSchema7): string | undefined {
    if (schema.allOf?.length !== 1) {
      return undefined;
    }

    const [allOfSchema] = schema.allOf;
    return typeof allOfSchema === 'object' &&
      allOfSchema != null &&
      Object.keys(allOfSchema).length === 1 &&
      typeof allOfSchema.$ref === 'string'
      ? allOfSchema.$ref
      : undefined;
  }

  function getLocalReferenceSchema(
    reference: string,
    schema: JSONSchema7,
  ): JSONSchema7Definition | undefined {
    const match = /^#\/(definitions|\$defs)\/(.+)$/.exec(reference);

    if (match == null) {
      return undefined;
    }

    const [, keyword, encodedName] = match;
    const name = encodedName.replace(/~1/g, '/').replace(/~0/g, '~');
    const definition =
      keyword === 'definitions'
        ? schema.definitions?.[name]
        : schema.$defs?.[name];

    return definition;
  }
}
