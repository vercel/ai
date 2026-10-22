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
 *
 * OpenAI also does not support regex lookaround in JSON Schema `pattern`
 * values. Those patterns are removed and left to client-side validation.
 *
 * Zod 4 represents recursive references as singleton `allOf` schemas. OpenAI
 * does not support `allOf`, but a singleton local reference can be rewritten
 * to a direct reference without changing its validation behavior.
 */
export function normalizeOpenAIJsonSchema(schema: JSONSchema7): {
  schema: JSONSchema7;
  warnings: SharedV4Warning[];
} {
  let removedPropertyNames = false;
  let removedLookaroundPattern = false;

  const normalizedSchema = normalizeSchema(schema, true);

  const warnings: SharedV4Warning[] = [];

  if (removedPropertyNames) {
    warnings.push({
      type: 'compatibility',
      feature: 'JSON Schema propertyNames',
      details:
        'OpenAI does not support JSON Schema propertyNames. It was removed before sending the schema, so OpenAI will not enforce property-name constraints.',
    });
  }

  if (removedLookaroundPattern) {
    warnings.push({
      type: 'compatibility',
      feature: 'JSON Schema pattern with regex lookaround',
      details:
        'OpenAI does not support regex lookaround in JSON Schema patterns. The pattern was removed before sending the schema, so OpenAI will not enforce that constraint.',
    });
  }

  return {
    schema: normalizedSchema,
    warnings,
  };

  function normalizeSchema(schema: JSONSchema7, isRoot = false): JSONSchema7 {
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

    if (
      normalizedSchema.pattern != null &&
      containsRegexLookaround(normalizedSchema.pattern)
    ) {
      delete normalizedSchema.pattern;
      removedLookaroundPattern = true;
    }

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

    const reference = getSingletonReference(normalizedSchema);

    if (reference == null) {
      return normalizedSchema;
    }

    const { allOf: _allOf, ...schemaWithoutAllOf } = normalizedSchema;

    if (!isRoot) {
      // A one-item allOf has the same validation behavior as its reference.
      return {
        ...schemaWithoutAllOf,
        $ref: reference,
      };
    }

    const referencedSchema = getLocalReferenceSchema(
      reference,
      normalizedSchema,
    );

    // OpenAI requires an object at the schema root, so a local root reference
    // must be expanded instead of being sent as a direct $ref.
    if (referencedSchema == null) {
      return normalizedSchema;
    }

    return {
      ...referencedSchema,
      ...schemaWithoutAllOf,
    };
  }

  function getSingletonReference(schema: JSONSchema7): string | undefined {
    // Do not rewrite intersections: only a single reference is equivalent to
    // a direct $ref.
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
  ): JSONSchema7 | undefined {
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

    return typeof definition === 'object' && definition != null
      ? definition
      : undefined;
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

function containsRegexLookaround(pattern: string): boolean {
  let escaped = false;
  let inCharacterClass = false;

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '[') {
      inCharacterClass = true;
      continue;
    }

    if (character === ']') {
      inCharacterClass = false;
      continue;
    }

    if (!inCharacterClass && character === '(' && pattern[index + 1] === '?') {
      const lookaroundPrefix = pattern[index + 2];

      if (lookaroundPrefix === '=' || lookaroundPrefix === '!') {
        return true;
      }

      if (
        lookaroundPrefix === '<' &&
        (pattern[index + 3] === '=' || pattern[index + 3] === '!')
      ) {
        return true;
      }
    }
  }

  return false;
}
