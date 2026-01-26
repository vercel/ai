import { JSONSchema7 } from '@ai-sdk/provider';
import { jsonSchema, Schema } from '@ai-sdk/provider-utils';
import * as z4 from 'zod/v4';

// Generic type for any schema that has safeParse and parse methods
type AnyValidationSchema = {
  safeParse: (
    value: unknown,
  ) => { success: true; data: unknown } | { success: false; error: unknown };
  parse: (value: unknown) => unknown;
};

// Type for dhi schema (has toJsonSchema method)
type DhiSchemaType = AnyValidationSchema & {
  toJsonSchema: () => Record<string, unknown>;
};

// Type for zod schema
type ZodSchemaType = z4.core.$ZodType<unknown, unknown>;

/**
 * Check if the schema is a dhi schema (has toJsonSchema method)
 */
function isDhiSchema(schema: unknown): schema is DhiSchemaType {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'toJsonSchema' in schema &&
    typeof (schema as DhiSchemaType).toJsonSchema === 'function'
  );
}

/**
 * Check if the schema is a Zod 4 schema (has _zod marker)
 */
function isZod4Schema(schema: unknown): schema is ZodSchemaType {
  return typeof schema === 'object' && schema !== null && '_zod' in schema;
}

/**
 * Creates an AI SDK schema from a dhi or zod schema.
 *
 * This function supports both:
 * - dhi schemas (uses built-in toJsonSchema() method)
 * - Zod 4 schemas (uses zod's toJSONSchema function)
 *
 * Users can choose which validation library to use - both are fully supported.
 *
 * @param schema - A dhi schema or Zod 4 schema to convert.
 * @returns An AI SDK Schema object.
 */
export function dhiSchema<SCHEMA extends AnyValidationSchema>(
  schema: SCHEMA,
): Schema<SCHEMA extends { parse: (value: unknown) => infer T } ? T : unknown> {
  type OutputType = SCHEMA extends { parse: (value: unknown) => infer T }
    ? T
    : unknown;

  const getJsonSchema = (): JSONSchema7 => {
    // Check if it's a dhi schema (has toJsonSchema method)
    if (isDhiSchema(schema)) {
      return schema.toJsonSchema() as JSONSchema7;
    }

    // Check if it's a Zod 4 schema
    if (isZod4Schema(schema)) {
      return z4.toJSONSchema(schema, {
        target: 'draft-7',
        io: 'input',
        reused: 'inline',
      }) as JSONSchema7;
    }

    // Fallback error
    throw new Error(
      'Schema must be either a dhi schema (with toJsonSchema method) or a Zod 4 schema. ' +
        'Please ensure you are using a compatible schema library.',
    );
  };

  const validate = (value: unknown) => {
    // Both dhi and zod use the same safeParse API
    const result = schema.safeParse(value);
    return result.success
      ? { success: true as const, value: result.data as OutputType }
      : { success: false as const, error: result.error as Error };
  };

  return jsonSchema(getJsonSchema, { validate });
}
