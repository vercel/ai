import { JSONSchema7Definition } from 'json-schema';

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

  if (type) result.type = type;
  if (description) result.description = description;
  if (required) result.required = required;
  if (format) result.format = format;

  if (constValue !== undefined) {
    result.enum = [constValue];
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

  // Ensure object types have non-empty properties
  if (result.type === 'object' && !result.properties) {
    result.properties = {};
  }

  return result;
}
