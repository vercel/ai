import { JSONSchema7 } from 'json-schema';
import * as z from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

export function convertZodToJSONSchema(
  zodSchema: z.Schema<unknown>,
): JSONSchema7 {
  // we assume that zodToJsonSchema will return a valid JSONSchema7
  return zodToJsonSchema(zodSchema) as JSONSchema7;
}
