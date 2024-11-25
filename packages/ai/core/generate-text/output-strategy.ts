import { JSONSchema7, JSONValue } from '@ai-sdk/provider';
import { ValidationResult } from '@ai-sdk/provider-utils';
import { Schema } from '@ai-sdk/ui-utils';

export interface OutputStrategy<RESULT> {
  readonly type: 'object' | 'text';
  readonly jsonSchema: JSONSchema7 | undefined;

  validateFinalResult(value: JSONValue | undefined): ValidationResult<RESULT>;
}

export const text: OutputStrategy<string> = {
  type: 'text',
  jsonSchema: undefined,
  validateFinalResult() {
    return { success: true, value: '' };
  },
};

export const object = <OBJECT>(
  schema: Schema<OBJECT>,
): OutputStrategy<OBJECT> => ({
  type: 'object',
  jsonSchema: schema.jsonSchema,
  validateFinalResult() {
    return { success: true, value: {} as OBJECT };
  },
});
