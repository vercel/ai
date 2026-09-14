import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
  type JSONSchema7Definition,
  type SharedV4Warning,
} from '@ai-sdk/provider';

/**
 * Normalizes JSON Schema for OpenAI structured outputs.
 *
 * OpenAI does not support the JSON Schema `propertyNames` keyword. Property
 * names in JSON objects are always strings, so string-based constraints can be
 * left to client-side validation after removing the keyword. This
 * compatibility layer does not rewrite non-string property name schemas.
 */
export function normalizeOpenAIJsonSchema(schema: JSONSchema7): {
  schema: JSONSchema7;
  warnings: SharedV4Warning[];
} {
  let removedPropertyNames = false;

  const normalizedSchema = normalizeSchema(schema);

  return {
    schema: normalizedSchema,
    warnings: removedPropertyNames
      ? [
          {
            type: 'compatibility',
            feature: 'JSON Schema propertyNames',
            details:
              'OpenAI does not support JSON Schema propertyNames. It was removed before sending the schema, so OpenAI will not enforce property-name constraints.',
          },
        ]
      : [],
  };

  function normalizeSchema(schema: JSONSchema7): JSONSchema7 {
    const propertyNames = schema.propertyNames;

    if (propertyNames != null) {
      if (
        typeof propertyNames === 'boolean' ||
        propertyNames.type !== 'string'
      ) {
        throw new UnsupportedFunctionalityError({
          functionality:
            'JSON Schema propertyNames that does not use a string schema',
        });
      }

      removedPropertyNames = true;
    }

    const normalizedSchema = { ...schema };
    delete normalizedSchema.propertyNames;

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

    if (normalizedSchema.additionalProperties != null) {
      normalizedSchema.additionalProperties = normalizeDefinition(
        normalizedSchema.additionalProperties,
      );
    }

    if (normalizedSchema.additionalItems != null) {
      normalizedSchema.additionalItems = normalizeDefinition(
        normalizedSchema.additionalItems,
      );
    }

    if (normalizedSchema.items != null) {
      normalizedSchema.items = Array.isArray(normalizedSchema.items)
        ? normalizedSchema.items.map(normalizeDefinition)
        : normalizeDefinition(normalizedSchema.items);
    }

    if (normalizedSchema.contains != null) {
      normalizedSchema.contains = normalizeDefinition(
        normalizedSchema.contains,
      );
    }

    if (normalizedSchema.not != null) {
      normalizedSchema.not = normalizeDefinition(normalizedSchema.not);
    }

    if (normalizedSchema.allOf != null) {
      normalizedSchema.allOf = normalizedSchema.allOf.map(normalizeDefinition);
    }

    if (normalizedSchema.anyOf != null) {
      normalizedSchema.anyOf = normalizedSchema.anyOf.map(normalizeDefinition);
    }

    if (normalizedSchema.oneOf != null) {
      normalizedSchema.oneOf = normalizedSchema.oneOf.map(normalizeDefinition);
    }

    if (normalizedSchema.definitions != null) {
      normalizedSchema.definitions = normalizeSchemaRecord(
        normalizedSchema.definitions,
      );
    }

    if (normalizedSchema.$defs != null) {
      normalizedSchema.$defs = normalizeSchemaRecord(normalizedSchema.$defs);
    }

    if (normalizedSchema.dependencies != null) {
      normalizedSchema.dependencies = Object.fromEntries(
        Object.entries(normalizedSchema.dependencies).map(
          ([key, dependency]) => [
            key,
            Array.isArray(dependency)
              ? dependency
              : normalizeDefinition(dependency),
          ],
        ),
      );
    }

    for (const keyword of ['if', 'then', 'else'] as const) {
      const conditionalSchema = normalizedSchema[keyword];
      if (conditionalSchema != null) {
        normalizedSchema[keyword] = normalizeDefinition(conditionalSchema);
      }
    }

    return normalizedSchema;
  }

  function normalizeSchemaRecord(
    schemas: Record<string, JSONSchema7Definition>,
  ): Record<string, JSONSchema7Definition> {
    return Object.fromEntries(
      Object.entries(schemas).map(([key, schema]) => [
        key,
        normalizeDefinition(schema),
      ]),
    );
  }

  function normalizeDefinition(
    definition: JSONSchema7Definition,
  ): JSONSchema7Definition {
    return typeof definition === 'boolean'
      ? definition
      : normalizeSchema(definition);
  }
}
