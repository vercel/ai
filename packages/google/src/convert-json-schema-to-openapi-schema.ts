import { JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Converts JSON Schema 7 to OpenAPI Schema 3.0
 */
export function convertJSONSchemaToOpenAPISchema(
  jsonSchema: JSONSchema7Definition,
  options?: {
    propertyOrdering?: string[];
  },
): unknown {
  return convertJSONSchemaToOpenAPISchemaInternal(jsonSchema, options, true);
}

function convertJSONSchemaToOpenAPISchemaInternal(
  jsonSchema: JSONSchema7Definition,
  options?: {
    propertyOrdering?: string[];
  },
  isTopLevel = false,
): unknown {
  // parameters need to be undefined if they are empty objects:
  if (isEmptyObjectSchema(jsonSchema)) {
    return undefined;
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

  if (constValue !== undefined) {
    result.enum = [constValue];
  }

  // Handle type
  if (type) {
    if (Array.isArray(type)) {
      if (type.includes('null')) {
        result.type = type.filter(t => t !== 'null')[0];
        result.nullable = true;
      } else {
        result.type = type;
      }
    } else if (type === 'null') {
      result.type = 'null';
    } else {
      result.type = type;
    }
  }

  // Handle enum
  if (enumValues !== undefined) {
    result.enum = enumValues;
  }

  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchemaInternal(
          value,
          options,
          false,
        );
        return acc;
      },
      {} as Record<string, unknown>,
    );

    // Add propertyOrdering only to top-level objects when provided in options
    if (
      isTopLevel &&
      options?.propertyOrdering &&
      Array.isArray(options.propertyOrdering)
    ) {
      result.propertyOrdering = options.propertyOrdering;
    }
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map(item =>
          convertJSONSchemaToOpenAPISchemaInternal(item, options, false),
        )
      : convertJSONSchemaToOpenAPISchemaInternal(items, options, false);
  }

  if (allOf) {
    result.allOf = allOf.map(schema =>
      convertJSONSchemaToOpenAPISchemaInternal(schema, options, false),
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
        const converted = convertJSONSchemaToOpenAPISchemaInternal(
          nonNullSchemas[0],
          options,
          false,
        );
        if (typeof converted === 'object') {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        // If there are multiple non-null schemas, keep them in anyOf
        result.anyOf = nonNullSchemas.map(schema =>
          convertJSONSchemaToOpenAPISchemaInternal(schema, options, false),
        );
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(schema =>
        convertJSONSchemaToOpenAPISchemaInternal(schema, options, false),
      );
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(schema =>
      convertJSONSchemaToOpenAPISchemaInternal(schema, options, false),
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
      Object.keys(jsonSchema.properties).length === 0)
  );
}
