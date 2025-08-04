import { asSchema } from '@ai-sdk/provider-utils';

/**
 * Detect if a schema is a z.record by examining its JSON Schema representation
 */
export function detectRecordSchema(schema: any): boolean {
  try {
    let jsonSchema;
    if (typeof schema === 'object' && schema !== null) {
      if ('_def' in schema) {
        jsonSchema = asSchema(schema).jsonSchema;
      } else if ('jsonSchema' in schema) {
        jsonSchema = schema.jsonSchema;
      } else {
        return false;
      }
    } else {
      return false;
    }

    return (
      jsonSchema &&
      jsonSchema.type === 'object' &&
      jsonSchema.additionalProperties &&
      typeof jsonSchema.additionalProperties === 'object' &&
      (!jsonSchema.properties ||
        Object.keys(jsonSchema.properties).length === 0)
    );
  } catch {
    return false;
  }
}
