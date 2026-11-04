import { z } from 'zod/v4';

type JsonLiteral = string | number | boolean | null;

type JsonSchemaObject = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  enum?: unknown[];
  default?: unknown;
  nullable?: boolean;
};

type ZodShape = Record<string, z.ZodTypeAny>;

export function jsonSchemaToZodShape(input: unknown): ZodShape {
  const schema = isJsonSchemaObject(input) ? input : {};
  return toZodShape(schema);
}

function toZodShape(schema: JsonSchemaObject | undefined): ZodShape {
  if (!schema?.properties) return {};
  const required = new Set(schema.required);
  const shape: ZodShape = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const propType = toZodType(propSchema);
    shape[key] = required.has(key) ? propType : propType.optional();
  }
  return shape;
}

function toZodType(schema: JsonSchemaObject | undefined): z.ZodTypeAny {
  if (!schema) return z.any();

  let zType = zodForEnum(schema) ?? zodForType(schema);
  if (schema.description) zType = zType.describe(schema.description);
  if (schema.nullable) zType = zType.nullable();
  if ('default' in schema) zType = zType.meta({ default: schema.default });
  return zType;
}

function zodForEnum(schema: JsonSchemaObject): z.ZodTypeAny | undefined {
  if (
    !Array.isArray(schema.enum) ||
    schema.enum.length === 0 ||
    !schema.enum.every(isJsonLiteral)
  ) {
    return undefined;
  }
  return z.literal(schema.enum);
}

function zodForType(schema: JsonSchemaObject): z.ZodTypeAny {
  const types = Array.isArray(schema.type)
    ? schema.type.filter((t): t is string => t !== 'null')
    : ([schema.type].filter(Boolean) as string[]);

  switch (types[0]) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(toZodType(schema.items));
    case 'object':
      return z.object(toZodShape(schema));
    case 'null':
      return z.null();
    default:
      return z.any();
  }
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
