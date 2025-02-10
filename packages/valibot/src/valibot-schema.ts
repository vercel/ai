import { toJsonSchema as valibotToJsonSchema } from '@valibot/to-json-schema';
import { jsonSchema, Schema } from 'ai';
import * as v from 'valibot';

export function valibotSchema<OBJECT>(
  valibotSchema: v.GenericSchema<unknown, OBJECT>,
): Schema<OBJECT> {
  return jsonSchema(valibotToJsonSchema(valibotSchema), {
    validate: value => {
      const result = v.safeParse(valibotSchema, value);
      return result.success
        ? { success: true, value: result.output }
        : { success: false, error: new v.ValiError(result.issues) };
    },
  });
}
