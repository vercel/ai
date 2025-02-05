import { JSONSchema7 } from 'json-schema';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { jsonSchema, Schema } from './schema';

export function zodSchema<OBJECT>(
  zodSchema: z.Schema<OBJECT, z.ZodTypeDef, any>,
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

  return jsonSchema(
    zodToJsonSchema(zodSchema, {
      $refStrategy: useReferences ? 'root' : 'none',
      target: 'jsonSchema7', // note: openai mode breaks various gemini conversions
    }) as JSONSchema7,
    {
      validate: value => {
        const result = zodSchema.safeParse(value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}
