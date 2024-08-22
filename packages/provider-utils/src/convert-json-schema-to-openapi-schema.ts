import { JSONSchema7Definition } from 'json-schema';

/**
 * Converts JSON Schema 7 to OpenAPI Schema 3.0
 */
export function convertJSONSchemaToOpenAPISchema(
  jsonSchema: JSONSchema7Definition,
): unknown {
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

  if (properties) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value);
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map(convertJSONSchemaToOpenAPISchema)
      : convertJSONSchemaToOpenAPISchema(items);
  }

  if (allOf) {
    result.allOf = allOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (anyOf) {
    result.anyOf = anyOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (oneOf) {
    result.oneOf = oneOf.map(convertJSONSchemaToOpenAPISchema);
  }

  if (minLength !== undefined) result.minLength = minLength;

  return result;
}
