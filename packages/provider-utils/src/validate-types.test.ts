import { TypeValidationError } from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { validateTypes, safeValidateTypes } from './validate-types';
import { validator } from './validator';

const customSchema: StandardSchemaV1<{ name: string; age: number }> = {
  '~standard': {
    version: 1,
    vendor: 'custom',
    validate: async (value: any) => {
      return typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        typeof value.name === 'string' &&
        'age' in value &&
        typeof value.age === 'number'
        ? { value }
        : { issues: [new Error('Invalid input')] };
    },
  },
};
const customValidator = validator<{ name: string; age: number }>(async value =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof value.name === 'string' &&
  'age' in value &&
  typeof value.age === 'number'
    ? { success: true, value: value as { name: string; age: number } }
    : {
        success: false,
        error: new TypeValidationError({
          value,
          cause: [new Error('Invalid input')],
        }),
      },
);

describe('validateTypes', () => {
  describe.each([
    ['Custom schema', customSchema],
    ['Custom validator', customValidator],
  ])('using %s', (_, schema) => {
    it('should return validated object for valid input', async () => {
      const input = { name: 'John', age: 30 };
      expect(await validateTypes({ value: input, schema })).toEqual(input);
    });

    it('should throw TypeValidationError for invalid input', async () => {
      const input = { name: 'John', age: '30' };

      try {
        await validateTypes({
          value: input,
          schema,
        });
        expect.fail('Expected TypeValidationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TypeValidationError);

        const typedError = error as TypeValidationError;

        expect({
          name: typedError.name,
          value: typedError.value,
          cause: typedError.cause,
          message: typedError.message,
        }).toStrictEqual({
          name: 'AI_TypeValidationError',
          value: input,
          cause: [expect.any(Error)],
          message: expect.stringContaining('Type validation failed'),
        });
      }
    });
  });
});

describe('safeValidateTypes', () => {
  describe.each([
    ['Custom schema', customSchema],
    ['Custom validator', customValidator],
  ])('using %s', (_, schema) => {
    it('should return validated object for valid input', async () => {
      const input = { name: 'John', age: 30 };
      const result = await safeValidateTypes({ value: input, schema });
      expect(result).toEqual({ success: true, value: input, rawValue: input });
    });

    it('should return error object for invalid input', async () => {
      const input = { name: 'John', age: '30' };
      const result = await safeValidateTypes({
        value: input,
        schema,
      });

      expect(result).toEqual({
        success: false,
        error: expect.any(TypeValidationError),
        rawValue: input,
      });

      if (!result.success) {
        expect(result.error).toBeInstanceOf(TypeValidationError);
        expect(result.error.value).toEqual(input);
        expect(result.error.message).toContain('Type validation failed');
      }
    });
  });
});
