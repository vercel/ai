import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
  type JSONSchema7Definition,
} from '@ai-sdk/provider';

/**
 * Converts JSON Schema 7 to OpenAPI Schema 3.0
 */
export function convertJSONSchemaToOpenAPISchema(
  jsonSchema: JSONSchema7Definition | undefined,
  isRoot = true,
): unknown {
  // Handle empty object schemas: undefined at root, preserved when nested
  if (jsonSchema == null) {
    return undefined;
  }

  if (isEmptyObjectSchema(jsonSchema)) {
    if (isRoot) {
      return undefined;
    }

    if (typeof jsonSchema === 'object' && jsonSchema.description) {
      return { type: 'object', description: jsonSchema.description };
    }
    return { type: 'object' };
  }

  if (typeof jsonSchema === 'boolean') {
    return { type: 'boolean', properties: {} };
  }

  const {
    type,
    description,
    required,
    properties,
    items,
    allOf,
    anyOf,
    oneOf,
    format,
    const: constValue,
    minLength,
    enum: enumValues,
  } = jsonSchema;

  const result: Record<string, unknown> = {};

  if (description) result.description = description;
  if (required) result.required = required;
  if (format) result.format = format;

  // Handle type
  if (type) {
    if (Array.isArray(type)) {
      const hasNull = type.includes('null');
      const nonNullTypes = type.filter(t => t !== 'null');

      if (nonNullTypes.length === 0) {
        // Only null type
        result.type = 'null';
      } else {
        // One or more non-null types: always use anyOf
        result.anyOf = nonNullTypes.map(t => ({ type: t }));
        if (hasNull) {
          result.nullable = true;
        }
      }
    } else {
      result.type = type;
    }
  }

  const values =
    enumValues ?? (constValue !== undefined ? [constValue] : undefined);

  if (values !== undefined) {
    addEnumToSchema({ values, type, result });
  }

  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value, false);
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map(item => convertJSONSchemaToOpenAPISchema(item, false))
      : convertJSONSchemaToOpenAPISchema(items, false);
  }

  if (allOf) {
    result.allOf = allOf.map(item =>
      convertJSONSchemaToOpenAPISchema(item, false),
    );
  }
  if (anyOf) {
    // Handle cases where anyOf includes a null type
    if (
      anyOf.some(
        schema => typeof schema === 'object' && schema?.type === 'null',
      )
    ) {
      const nonNullSchemas = anyOf.filter(
        schema => !(typeof schema === 'object' && schema?.type === 'null'),
      );

      if (nonNullSchemas.length === 1) {
        // If there's only one non-null schema, convert it and make it nullable
        const converted = convertJSONSchemaToOpenAPISchema(
          nonNullSchemas[0],
          false,
        );
        if (typeof converted === 'object') {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        // If there are multiple non-null schemas, keep them in anyOf
        result.anyOf = nonNullSchemas.map(item =>
          convertJSONSchemaToOpenAPISchema(item, false),
        );
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(item =>
        convertJSONSchemaToOpenAPISchema(item, false),
      );
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(item =>
      convertJSONSchemaToOpenAPISchema(item, false),
    );
  }

  if (minLength !== undefined) {
    result.minLength = minLength;
  }

  return result;
}

function addEnumToSchema({
  values,
  type,
  result,
}: {
  values: NonNullable<JSONSchema7['enum']>;
  type: JSONSchema7['type'];
  result: Pick<JSONSchema7, 'type' | 'enum' | 'format'>;
}) {
  // Gemini ignores a string enum when its schema has no type, so infer it.
  if (
    (type == null || type === 'string') &&
    values.length > 0 &&
    values.every(value => typeof value === 'string')
  ) {
    result.type = 'string';
    result.enum = values;
    return;
  }

  // Gemini requires string enum members for these types. The schema type still
  // controls the type of the generated JSON value.
  if (
    (type === 'number' &&
      values.every(
        value => typeof value === 'number' && Number.isFinite(value),
      )) ||
    (type === 'integer' && values.every(value => Number.isInteger(value))) ||
    (type === 'boolean' && values.every(value => typeof value === 'boolean'))
  ) {
    result.format = 'enum';
    result.enum = values.map(String);
    return;
  }

  // A null type already restricts the value to null.
  if (
    (type == null || type === 'null') &&
    values.length > 0 &&
    values.every(value => value === null)
  ) {
    result.type = 'null';
    return;
  }

  throw new UnsupportedFunctionalityError({
    functionality: 'JSON Schema enum with mixed or unsupported values',
    message:
      'Google does not support this JSON Schema enum. Enum values must share one supported primitive type and match the schema type.',
  });
}

function isEmptyObjectSchema(jsonSchema: JSONSchema7Definition): boolean {
  return (
    jsonSchema != null &&
    typeof jsonSchema === 'object' &&
    jsonSchema.type === 'object' &&
    (jsonSchema.properties == null ||
      Object.keys(jsonSchema.properties).length === 0) &&
    !jsonSchema.additionalProperties
  );
}
