import { JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Converts JSON Schema 7 to Anthropic-compatible format.
 * Anthropic does not support 'oneOf', so it is converted to 'anyOf'.
 */
export function convertJSONSchemaToAnthropicSchema(
  jsonSchema: JSONSchema7Definition | undefined,
): unknown {
  if (jsonSchema == null) {
    return undefined;
  }

  if (typeof jsonSchema === 'boolean') {
    return { type: 'boolean' };
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
    additionalProperties,
    ...rest
  } = jsonSchema;

  const result: Record<string, unknown> = {};

  // Copy over any additional properties that aren't explicitly handled
  Object.entries(rest).forEach(([key, value]) => {
    result[key] = value;
  });

  if (description) result.description = description;
  if (required) result.required = required;
  if (format) result.format = format;
  if (additionalProperties !== undefined) {
    result.additionalProperties = additionalProperties;
  }

  if (constValue !== undefined) {
    result.enum = [constValue];
  }

  // Handle type
  if (type) {
    result.type = type;
  }

  // Handle enum
  if (enumValues !== undefined) {
    result.enum = enumValues;
  }

  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToAnthropicSchema(value);
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map(item => convertJSONSchemaToAnthropicSchema(item))
      : convertJSONSchemaToAnthropicSchema(items);
  }

  if (allOf) {
    result.allOf = allOf.map(item => convertJSONSchemaToAnthropicSchema(item));
  }

  if (anyOf) {
    result.anyOf = anyOf.map(item => convertJSONSchemaToAnthropicSchema(item));
  }

  // Convert oneOf to anyOf (Anthropic does not support oneOf)
  if (oneOf) {
    result.anyOf = oneOf.map(item => convertJSONSchemaToAnthropicSchema(item));
  }

  if (minLength !== undefined) {
    result.minLength = minLength;
  }

  return result;
}
