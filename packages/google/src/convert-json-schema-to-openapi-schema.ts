import { JSONSchema7Definition } from '@ai-sdk/provider';
import { PropertyOrderingConfig } from './google-generative-ai-settings';

/**
 * Converts JSON Schema 7 to OpenAPI Schema 3.0
 */
export function convertJSONSchemaToOpenAPISchema(
  jsonSchema: JSONSchema7Definition,
  propertyOrderingConfig?: PropertyOrderingConfig,
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
        // Apply nested property ordering configuration if it exists for this property
        const nestedConfig = propertyOrderingConfig?.[key];
        // Only pass nested config if it's not null (null means leaf property)
        acc[key] = convertJSONSchemaToOpenAPISchema(
          value,
          nestedConfig === null ? undefined : nestedConfig,
        );
        return acc;
      },
      {} as Record<string, unknown>,
    );

    // Apply property ordering if configuration is provided for this level
    if (
      propertyOrderingConfig &&
      Object.keys(propertyOrderingConfig).length > 0
    ) {
      const propertyOrdering = Object.keys(propertyOrderingConfig);
      // Only include properties that actually exist in the schema
      const validPropertyOrdering = propertyOrdering.filter(prop =>
        properties.hasOwnProperty(prop),
      );
      if (validPropertyOrdering.length > 0) {
        result.propertyOrdering = validPropertyOrdering;
      }
    }
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map(item => convertJSONSchemaToOpenAPISchema(item))
      : convertJSONSchemaToOpenAPISchema(items);
  }

  if (allOf) {
    result.allOf = allOf.map(schema =>
      convertJSONSchemaToOpenAPISchema(schema),
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
        const converted = convertJSONSchemaToOpenAPISchema(nonNullSchemas[0]);
        if (typeof converted === 'object') {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        // If there are multiple non-null schemas, keep them in anyOf
        result.anyOf = nonNullSchemas.map(schema =>
          convertJSONSchemaToOpenAPISchema(schema),
        );
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(schema =>
        convertJSONSchemaToOpenAPISchema(schema),
      );
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(schema =>
      convertJSONSchemaToOpenAPISchema(schema),
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
