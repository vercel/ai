import { JSONValue } from '@ai-sdk/provider';
import { safeValidateTypes, ValidationResult } from '@ai-sdk/provider-utils';
import { DeepPartial, Schema } from '@ai-sdk/ui-utils';
import { NoObjectGeneratedError } from './no-object-generated-error';
import { JSONSchema7 } from 'json-schema';

export interface OutputStrategy<PARTIAL, RESULT> {
  readonly type: 'object' | 'no-schema';
  validatePartialResult(value: JSONValue): ValidationResult<PARTIAL>;
  validateFinalResult(value: JSONValue | undefined): ValidationResult<RESULT>;
  jsonSchema: JSONSchema7 | undefined;
}

export const noSchemaOutputStrategy: OutputStrategy<JSONValue, JSONValue> = {
  type: 'no-schema',
  jsonSchema: undefined,

  validatePartialResult(value: JSONValue): ValidationResult<JSONValue> {
    return { success: true, value };
  },

  validateFinalResult(
    value: JSONValue | undefined,
  ): ValidationResult<JSONValue> {
    return value === undefined
      ? { success: false, error: new NoObjectGeneratedError() }
      : { success: true, value };
  },
};

export const objectOutputStrategy = <T>(
  schema: Schema<T>,
): OutputStrategy<DeepPartial<T>, T> => ({
  type: 'object',
  jsonSchema: schema.jsonSchema,

  validatePartialResult(value: JSONValue): ValidationResult<DeepPartial<T>> {
    return { success: true, value: value as DeepPartial<T> };
  },

  validateFinalResult(value: JSONValue | undefined): ValidationResult<T> {
    return safeValidateTypes({ value, schema });
  },
});