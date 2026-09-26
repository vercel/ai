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
 */
export function normalizeOpenAIJsonSchema(schema: JSONSchema7): {
  schema: JSONSchema7;
  warnings: SharedV4Warning[];
} {
  let removedPropertyNames = false;
  let removedLookaroundPattern = false;

  const normalizedSchema = normalizeSchema(schema);

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

  function normalizeSchema(schema: JSONSchema7): JSONSchema7 {
    const propertyNames = schema.propertyNames;

    if (propertyNames != null) {
      if (!canMatchString(propertyNames)) {
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

/**
 * Checks whether a `propertyNames` schema can match a string. Property names
 * are always strings, so this only returns false for schemas that match no
 * property name: `false`, `{ not: {} }`, a non-string `type`, `const`, or
 * `enum`, or combinations of these in `allOf`, `anyOf`, or `oneOf`. Other
 * keywords, including `$ref`, are not evaluated.
 */
function canMatchString(schema: JSONSchema7Definition): boolean {
  if (typeof schema === 'boolean') {
    return schema;
  }

  if (
    schema.type != null &&
    (Array.isArray(schema.type)
      ? !schema.type.includes('string')
      : schema.type !== 'string')
  ) {
    return false;
  }

  if (schema.const !== undefined && typeof schema.const !== 'string') {
    return false;
  }

  if (
    schema.enum != null &&
    !schema.enum.some(value => typeof value === 'string')
  ) {
    return false;
  }

  if (
    schema.not === true ||
    (schema.not != null &&
      typeof schema.not === 'object' &&
      Object.keys(schema.not).length === 0)
  ) {
    return false;
  }

  return (
    (schema.allOf?.every(canMatchString) ?? true) &&
    (schema.anyOf?.some(canMatchString) ?? true) &&
    (schema.oneOf?.some(canMatchString) ?? true)
  );
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
