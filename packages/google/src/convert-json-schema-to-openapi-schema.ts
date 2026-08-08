import type { JSONSchema7Definition } from '@ai-sdk/provider';

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

  // Handle enum and const (a const is a single-value enum). The Gemini API
  // only allows enum on string types with string values, so:
  // - a null value is expressed via `nullable` instead
  // - string values are sent as enum (inferring `type: 'string'` when the
  //   type is missing, since Gemini rejects enum without a type)
  // - non-string values cannot be sent as enum without changing the type
  //   (which would break validation of the generated output against the
  //   original schema), so they are moved into the description instead
  const allEnumValues =
    enumValues !== undefined
      ? enumValues
      : constValue !== undefined
        ? [constValue]
        : undefined;

  if (allEnumValues !== undefined) {
    const nonNullEnumValues = allEnumValues.filter(value => value !== null);

    if (nonNullEnumValues.length < allEnumValues.length) {
      result.nullable = true;
    }

    if (nonNullEnumValues.length > 0) {
      if (nonNullEnumValues.every(value => typeof value === 'string')) {
        result.enum = nonNullEnumValues;
        if (result.type == null && result.anyOf == null) {
          result.type = 'string';
        }
      } else {
        const valuesText = nonNullEnumValues
          .map(value => JSON.stringify(value))
          .join(', ');
        result.description = result.description
          ? `${result.description} (Possible values: ${valuesText})`
          : `Possible values: ${valuesText}`;

        if (result.type == null && result.anyOf == null) {
          if (nonNullEnumValues.every(value => typeof value === 'number')) {
            result.type = 'number';
          } else if (
            nonNullEnumValues.every(value => typeof value === 'boolean')
          ) {
            result.type = 'boolean';
          }
        }
      }
    }
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
