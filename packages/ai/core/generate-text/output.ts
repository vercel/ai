import { JSONSchema7, JSONValue } from '@ai-sdk/provider';
import { ValidationResult } from '@ai-sdk/provider-utils';
import { asSchema, Schema } from '@ai-sdk/ui-utils';
import { z } from 'zod';

export interface Output<RESULT> {
  readonly type: 'object' | 'text';
  readonly jsonSchema: JSONSchema7 | undefined;

  validateFinalResult(value: JSONValue | undefined): ValidationResult<RESULT>;
}

export const text = (): Output<string> => ({
  type: 'text',
  jsonSchema: undefined,
  validateFinalResult() {
    return { success: true, value: '' };
  },
});

export const object = <OBJECT>({
  schema: inputSchema,
}: {
  schema: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;
}): Output<OBJECT> => {
  const schema = asSchema(inputSchema);

  return {
    type: 'object',
    jsonSchema: schema.jsonSchema,
    validateFinalResult() {
      return { success: true, value: {} as OBJECT };
    },
  };
};
