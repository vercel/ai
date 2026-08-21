import type { JSONSchema7 } from '@ai-sdk/provider';

/**
 * Recursively adds additionalProperties: false to object schemas that do not
 * define a schema for their additional properties. This is necessary because
 * some providers (e.g. OpenAI) do not support additionalProperties: true.
 */
export function addAdditionalPropertiesToJsonSchema(
  jsonSchema: JSONSchema7,
): JSONSchema7 {
<<<<<<< HEAD
  if (jsonSchema.type === 'object') {
    jsonSchema.additionalProperties = false;
    const properties = jsonSchema.properties;
=======
  if (
    jsonSchema.type === 'object' ||
    (Array.isArray(jsonSchema.type) && jsonSchema.type.includes('object'))
  ) {
    const { additionalProperties } = jsonSchema;
    jsonSchema.additionalProperties =
      additionalProperties != null && typeof additionalProperties !== 'boolean'
        ? visit(additionalProperties)
        : false;

    const { properties } = jsonSchema;
>>>>>>> b74971f7cc (fix: Zod 4 record and catchall value schemas being erased during JSON Schema conversion (#18046))
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
