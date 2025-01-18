import { JSONSchema7 } from 'json-schema';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { jsonSchema, Schema } from './schema';

export function zodSchema<OUTPUT, INPUT = OUTPUT>(
  zodSchema: z.Schema<OUTPUT, z.ZodTypeDef, INPUT>,
): Schema<OUTPUT, INPUT> {
  return jsonSchema<OUTPUT, INPUT>(
    zodToJsonSchema(zodSchema, {
      $refStrategy: 'none', // no references (to support openapi conversion for google)
      target: 'jsonSchema7', // note: openai mode breaks various gemini conversions
    }) as JSONSchema7,
    {
      validate: value => {
        const result = zodSchema.safeParse(value);
        return result.success
          ? { success: true, value: result.data, rawValue: value as INPUT }
          : { success: false, error: result.error };
      },
    },
  );
}
