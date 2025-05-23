import { JSONSchema7 } from '@ai-sdk/provider';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4/core';
import zodToJsonSchema from 'zod-to-json-schema';
import { jsonSchema, Schema } from './schema';

export function zodSchema<OBJECT>(
  zodSchema: z4.$ZodType<OBJECT, any> | z3.Schema<OBJECT, z3.ZodTypeDef, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  // default to no references (to support openapi conversion for google)
  const useReferences = options?.useReferences ?? false;

  // https://zod.dev/library-authors?id=how-to-support-zod-3-and-zod-4-simultaneously
  const isZod4 = '_zod' in zodSchema;

  const converted = isZod4
    ? (z4.toJSONSchema(zodSchema, { target: 'draft-7' }) as JSONSchema7)
    : (zodToJsonSchema(zodSchema, {
        $refStrategy: useReferences ? 'root' : 'none',
        target: 'jsonSchema7', // note: openai mode breaks various gemini conversions
      }) as JSONSchema7);

  return jsonSchema(converted, {
    validate: value => {
      let result;
      if (isZod4) {
        // Zod 4 schema
        z4.safeParse;
        result = z4.safeParse(zodSchema, value);
      } else {
        // Zod 3 schema
        result = zodSchema.safeParse(value);
      }

      return result.success
        ? { success: true, value: result.data }
        : { success: false, error: result.error };
    },
  });
}
