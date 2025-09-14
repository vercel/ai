import { JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Converts JSON Schema 7 to OpenAPI Schema 3.0
 */
export function convertJSONSchemaToOpenAPISchema(
  jsonSchema: JSONSchema7Definition | undefined,
  propertyOrdering?: Record<string, string[]> | string[],
  currentPath: string = '',
): unknown {
  // parameters need to be undefined if they are empty objects:
  if (jsonSchema == null || isEmptyObjectSchema(jsonSchema)) {
    return undefined;
  }

  // Normalize propertyOrdering: convert array format to object format
  const normalizedPropertyOrdering: Record<string, string[]> | undefined =
    Array.isArray(propertyOrdering)
      ? { '': propertyOrdering }
      : propertyOrdering;

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
        const nestedPath = currentPath ? `${currentPath}.${key}` : key;
        acc[key] = convertJSONSchemaToOpenAPISchema(
          value,
          normalizedPropertyOrdering,
          nestedPath,
        );
        return acc;
      },
      {} as Record<string, unknown>,
    );

    // Add propertyOrdering if it exists for this path
    if (normalizedPropertyOrdering && normalizedPropertyOrdering[currentPath]) {
      result.propertyOrdering = normalizedPropertyOrdering[currentPath];
    }
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map((item, index) =>
          convertJSONSchemaToOpenAPISchema(
            item,
            normalizedPropertyOrdering,
            `${currentPath}[${index}]`,
          ),
        )
      : convertJSONSchemaToOpenAPISchema(
          items,
          normalizedPropertyOrdering,
          `${currentPath}[]`,
        );
  }

  if (allOf) {
    result.allOf = allOf.map(schema =>
      convertJSONSchemaToOpenAPISchema(
        schema,
        normalizedPropertyOrdering,
        currentPath,
      ),
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
          normalizedPropertyOrdering,
          currentPath,
        );
        if (typeof converted === 'object') {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        // If there are multiple non-null schemas, keep them in anyOf
        result.anyOf = nonNullSchemas.map(schema =>
          convertJSONSchemaToOpenAPISchema(
            schema,
            normalizedPropertyOrdering,
            currentPath,
          ),
        );
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(schema =>
        convertJSONSchemaToOpenAPISchema(
          schema,
          normalizedPropertyOrdering,
          currentPath,
        ),
      );
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(schema =>
      convertJSONSchemaToOpenAPISchema(
        schema,
        normalizedPropertyOrdering,
        currentPath,
      ),
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
