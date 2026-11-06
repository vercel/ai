import { z } from 'zod/v4';

export type JsonSchemaObject = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaObject;
  items?: JsonSchemaObject;
  nullable?: boolean;
};

// Convert a host tool's JSON Schema to a zod object for LangChain's `tool()`.
export function jsonSchemaToZodObject(input: unknown) {
  const schema = isJsonSchemaObject(input) ? input : {};
  return toZodObject(schema);
}

function toZodObject(schema: JsonSchemaObject) {
  const object = z.object(toZodShape(schema));
  if (schema.additionalProperties === false) return object;

  // JSON Schema allows additional properties by default, but a plain zod
  // object strips them before the tool runs.
  return object.catchall(
    isJsonSchemaObject(schema.additionalProperties)
      ? toZodType(schema.additionalProperties)
      : z.unknown(),
  );
}

function toZodShape(schema: JsonSchemaObject): Record<string, z.ZodTypeAny> {
  if (!schema.properties) return {};
  const required = new Set(schema.required);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const propType = toZodType(propSchema);
    shape[key] = required.has(key) ? propType : propType.optional();
  }
  return shape;
}

function toZodType(schema: JsonSchemaObject | undefined): z.ZodTypeAny {
  if (!schema) return z.any();
  const types = Array.isArray(schema.type)
    ? schema.type.filter(t => t !== 'null')
    : ([schema.type].filter(Boolean) as string[]);
  let zType: z.ZodTypeAny;
  switch (types[0]) {
    case 'string':
      zType = z.string();
      break;
    case 'number':
      zType = z.number();
      break;
    case 'integer':
      zType = z.number().int();
      break;
    case 'boolean':
      zType = z.boolean();
      break;
    case 'array':
      zType = z.array(toZodType(schema.items));
      break;
    case 'object':
      zType = toZodObject(schema);
      break;
    case 'null':
      zType = z.null();
      break;
    default:
      zType = z.any();
  }
  if (schema.description) zType = zType.describe(schema.description);
  if (isNullable(schema)) zType = zType.nullable();
  return zType;
}

function isNullable(schema: JsonSchemaObject): boolean {
  return (
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes('null'))
  );
}

function isJsonSchemaObject(input: unknown): input is JsonSchemaObject {
  return input != null && typeof input === 'object' && !Array.isArray(input);
}
