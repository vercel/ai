import type { JSONSchema7 } from '@ai-sdk/provider';

/**
 * Recursively adds additionalProperties: false to object schemas that do not
 * define a schema for their additional properties. This is necessary because
 * some providers (e.g. OpenAI) do not support additionalProperties: true.
 */
export function addAdditionalPropertiesToJsonSchema(
  jsonSchema: JSONSchema7,
): JSONSchema7 {
  if (jsonSchema.type === 'object') {
    const { additionalProperties } = jsonSchema;
    jsonSchema.additionalProperties =
      additionalProperties != null && typeof additionalProperties !== 'boolean'
        ? addAdditionalPropertiesToJsonSchema(additionalProperties)
        : false;

    const properties = jsonSchema.properties;
    if (properties != null) {
      for (const property in properties) {
        properties[property] = addAdditionalPropertiesToJsonSchema(
          properties[property] as JSONSchema7,
        );
      }
    }
  }
  if (jsonSchema.type === 'array' && jsonSchema.items != null) {
    if (Array.isArray(jsonSchema.items)) {
      jsonSchema.items = jsonSchema.items.map(item =>
        addAdditionalPropertiesToJsonSchema(item as JSONSchema7),
      );
    } else {
      jsonSchema.items = addAdditionalPropertiesToJsonSchema(
        jsonSchema.items as JSONSchema7,
      );
    }
  }
  return jsonSchema;
}
