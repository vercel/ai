import { TypeValidationError } from '@ai-sdk/provider';
import { validator } from '@ai-sdk/provider-utils';
import { TSchema } from 'typebox';
import Value from 'typebox/value';

export function typeboxValidator<OBJECT>(typeboxSchema: TSchema) {
  return validator<OBJECT>(async value => {
    try {
      return { success: true, value: Value.Parse(typeboxSchema, value) };
    } catch (error) {
      return {
        success: false,
        error: new TypeValidationError({
          value,
          cause: error,
        }),
      };
    }
  });
}
