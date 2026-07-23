import { z } from 'zod/v4';

type JsonLiteral = string | number | boolean | null;

export type JsonSchemaObject = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject | JsonSchemaObject[];
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  nullable?: boolean;
};

type ZodShape = Record<string, z.ZodTypeAny>;

export function jsonSchemaToZodShape(input: unknown): ZodShape {
  const schema = isJsonSchemaObject(input) ? input : {};
  return toZodShape(schema);
}

function toZodShape(schema: JsonSchemaObject | undefined): ZodShape {
  if (!schema?.properties) return {};
  const required = new Set(schema.required ?? []);
  const shape: ZodShape = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const propType = toZodType(propSchema);
    let propertyType = required.has(key) ? propType : propType.optional();
    if (propSchema.description) {
      propertyType = propertyType.describe(propSchema.description);
    }
    shape[key] = propertyType;
  }
  return shape;
}

function toZodType(schema: JsonSchemaObject | undefined): z.ZodTypeAny {
  if (!schema) return z.any();

  let zType =
    zodForConst(schema) ??
    zodForEnum(schema) ??
    zodForNullableUnion(schema) ??
    zodForType(schema);

  if (isNullable(schema)) zType = zType.nullable();
  if (schema.description) zType = zType.describe(schema.description);
  return zType;
}

function zodForType(schema: JsonSchemaObject): z.ZodTypeAny {
  const types = getNonNullTypes(schema);
  if (types.length > 1) return z.any();
  if (Array.isArray(schema.type) && types.length === 0) return z.null();
  const type = types[0] ?? (schema.properties ? 'object' : undefined);

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(
        Array.isArray(schema.items) ? z.any() : toZodType(schema.items),
      );
    case 'object':
      return z.object(toZodShape(schema));
    case 'null':
      return z.null();
    default:
      return z.any();
  }
}

function zodForConst(schema: JsonSchemaObject): z.ZodTypeAny | undefined {
  if (!('const' in schema)) return undefined;
  return isJsonLiteral(schema.const) ? z.literal(schema.const) : z.any();
}

function zodForEnum(schema: JsonSchemaObject): z.ZodTypeAny | undefined {
  if (!Array.isArray(schema.enum)) return undefined;
  if (!schema.enum.every(isJsonLiteral)) return z.any();
  return zodForLiterals(schema.enum);
}

function zodForNullableUnion(
  schema: JsonSchemaObject,
): z.ZodTypeAny | undefined {
  const unionSchemas = schema.anyOf ?? schema.oneOf;
  if (!unionSchemas || unionSchemas.length < 2) return undefined;

  const nonNullSchemas = unionSchemas.filter(item => !isNullOnlySchema(item));
  if (nonNullSchemas.length !== 1) return undefined;

  return toZodType(nonNullSchemas[0]).nullable();
}

function zodForLiterals(values: JsonLiteral[]): z.ZodTypeAny {
  if (values.length === 0) return z.any();
  if (values.length === 1) return z.literal(values[0]);

  const literals = values.map(value => z.literal(value)) as unknown as [
    z.ZodTypeAny,
    z.ZodTypeAny,
    ...z.ZodTypeAny[],
  ];
  return z.union(literals);
}

function getNonNullTypes(schema: JsonSchemaObject): string[] {
  return Array.isArray(schema.type)
    ? schema.type.filter(type => type !== 'null')
    : ([schema.type].filter(Boolean) as string[]);
}

function isNullable(schema: JsonSchemaObject): boolean {
  return (
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes('null'))
  );
}

function isNullOnlySchema(schema: JsonSchemaObject): boolean {
  return (
    schema.type === 'null' ||
    (Array.isArray(schema.type) &&
      schema.type.length === 1 &&
      schema.type[0] === 'null') ||
    schema.const === null ||
    (Array.isArray(schema.enum) &&
      schema.enum.length === 1 &&
      schema.enum[0] === null)
  );
}

function isJsonSchemaObject(input: unknown): input is JsonSchemaObject {
  return input != null && typeof input === 'object' && !Array.isArray(input);
}

function isJsonLiteral(value: unknown): value is JsonLiteral {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
