import { JSONSchema7 } from '@ai-sdk/provider';

/**
 * Recursively adds additionalProperties: false to the JSON schema. This is necessary because some providers (e.g. OpenAI) do not support additionalProperties: true.
 */
export function addAdditionalPropertiesToJsonSchema(
  jsonSchema: JSONSchema7,
): JSONSchema7 {
  if (jsonSchema.type === 'object') {
    jsonSchema.additionalProperties = false;
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
