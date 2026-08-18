import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
  type JSONSchema7Definition,
} from '@ai-sdk/provider';

type JSONSchema7WithDefinitions = JSONSchema7 & {
  $defs?: Record<string, JSONSchema7Definition>;
};

/**
 * Converts JSON Schema 7 to OpenAPI Schema 3.0
 */
export function convertJSONSchemaToOpenAPISchema(
  jsonSchema: JSONSchema7Definition | undefined,
  isRoot = true,
): unknown {
  // Handle empty object schemas: undefined at root, preserved when nested
  if (jsonSchema == null) {
    return undefined;
  }

  if (isEmptyObjectSchema(jsonSchema)) {
    if (isRoot) {
      return undefined;
    }

    if (typeof jsonSchema === 'object' && jsonSchema.description) {
      return { type: 'object', description: jsonSchema.description };
    }
    return { type: 'object' };
  }

  if (typeof jsonSchema === 'boolean') {
    return { type: 'boolean', properties: {} };
  }

  const {
    $ref,
    $defs,
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
  } = jsonSchema as JSONSchema7WithDefinitions;

  const result: Record<string, unknown> = {};

  if (description) result.description = description;
  if (required) result.required = required;
  if (format) result.format = format;
  if ($ref != null) result.ref = convertJSONSchemaReference($ref);

  if ($defs) {
    result.defs = Object.fromEntries(
      Object.entries($defs).map(([key, value]) => [
        key,
        convertJSONSchemaToOpenAPISchema(value, false),
      ]),
    );
  }

  // Handle type
  if (type) {
    if (Array.isArray(type)) {
      const hasNull = type.includes('null');
      const nonNullTypes = type.filter(t => t !== 'null');

      if (nonNullTypes.length === 0) {
        // Only null type
        result.type = 'null';
      } else {
        // One or more non-null types: always use anyOf
        result.anyOf = nonNullTypes.map(t => ({ type: t }));
        if (hasNull) {
          result.nullable = true;
        }
      }
    } else {
      result.type = type;
    }
  }

  const values =
    enumValues ?? (constValue !== undefined ? [constValue] : undefined);

  if (values !== undefined) {
    addEnumToSchema({ values, type, result });
  }

  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value, false);
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map(item => convertJSONSchemaToOpenAPISchema(item, false))
      : convertJSONSchemaToOpenAPISchema(items, false);
  }

  if (allOf) {
    result.allOf = allOf.map(item =>
      convertJSONSchemaToOpenAPISchema(item, false),
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
          false,
        );
        if (typeof converted === 'object') {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        // If there are multiple non-null schemas, keep them in anyOf
        result.anyOf = nonNullSchemas.map(item =>
          convertJSONSchemaToOpenAPISchema(item, false),
        );
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(item =>
        convertJSONSchemaToOpenAPISchema(item, false),
      );
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(item =>
      convertJSONSchemaToOpenAPISchema(item, false),
    );
  }

  if (minLength !== undefined) {
    result.minLength = minLength;
  }

  return result;
}

function convertJSONSchemaReference(reference: string): string {
  const rootDefinitionPrefix = '#/$defs/';
  const definitionName = reference.startsWith(rootDefinitionPrefix)
    ? reference.slice(rootDefinitionPrefix.length)
    : undefined;

  if (
    definitionName == null ||
    definitionName.length === 0 ||
    definitionName.includes('/')
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: `JSON Schema reference: ${reference}`,
      message:
        'Google only supports JSON Schema references to direct children of root-level $defs.',
    });
  }

  return `#/defs/${definitionName}`;
}

type EnumValues = NonNullable<JSONSchema7['enum']>;
type EnumType = 'string' | 'number' | 'integer' | 'boolean';
type GoogleEnumSchema = {
  type?: JSONSchema7['type'];
  enum?: JSONSchema7['enum'];
  format?: JSONSchema7['format'];
  anyOf?: JSONSchema7['anyOf'];
  nullable?: boolean;
};

function addEnumToSchema({
  values,
  type,
  result,
}: {
  values: EnumValues;
  type: JSONSchema7['type'];
  result: GoogleEnumSchema;
}) {
  const nullable =
    (Array.isArray(type) && type.includes('null')) ||
    (type === undefined && values.includes(null));

  // Gemini uses nullable instead of a null enum member.
  const enumValues = nullable ? values.filter(value => value !== null) : values;

  if (values.length > 0 && values.every(value => value === null)) {
    const typeAllowsNull =
      type === undefined ||
      type === 'null' ||
      (Array.isArray(type) && type.includes('null'));

    if (typeAllowsNull) {
      result.type = 'null';
      if (Array.isArray(type)) {
        delete result.anyOf;
      }
      return;
    }
  }

  const enumType = getEnumType({ values: enumValues, type });

  if (enumType === undefined) {
    throw new UnsupportedFunctionalityError({
      functionality: 'JSON Schema enum with mixed or unsupported values',
      message:
        'Google does not support this JSON Schema enum. Enum values must share one supported primitive type and match the schema type.',
    });
  }

  result.type = enumType;

  // The earlier type-array conversion created anyOf. The enum gives us one
  // concrete value type, so store that type directly.
  if (Array.isArray(type)) {
    delete result.anyOf;
  }

  if (nullable) {
    result.nullable = true;
  }

  if (enumType === 'string') {
    result.enum = enumValues;
  } else {
    result.format = 'enum';
    result.enum = enumValues.map(String);
  }
}

function getEnumType({
  values,
  type,
}: {
  values: EnumValues;
  type: JSONSchema7['type'];
}): EnumType | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const typeAllows = (enumType: EnumType) =>
    type === undefined ||
    type === enumType ||
    (Array.isArray(type) && type.includes(enumType));

  if (
    typeAllows('string') &&
    values.every(value => typeof value === 'string')
  ) {
    return 'string';
  }

  if (
    (typeAllows('number') || typeAllows('integer')) &&
    values.every(value => typeof value === 'number' && Number.isFinite(value))
  ) {
    if (typeAllows('number')) {
      return 'number';
    }

    if (values.every(value => Number.isInteger(value))) {
      return 'integer';
    }
  }

  if (
    typeAllows('boolean') &&
    values.every(value => typeof value === 'boolean')
  ) {
    return 'boolean';
  }

  return undefined;
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
