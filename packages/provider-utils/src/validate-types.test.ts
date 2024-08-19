import { TypeValidationError } from '@ai-sdk/provider';
import { z } from 'zod';
import { validateTypes, safeValidateTypes } from './validate-types';
import { validator } from './validator';

const zodSchema = z.object({ name: z.string(), age: z.number() });
const customValidator = validator<{ name: string; age: number }>(value =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof value.name === 'string' &&
  'age' in value &&
  typeof value.age === 'number'
    ? { success: true, value: value as { name: string; age: number } }
    : { success: false, error: new Error('Invalid input') },
);

describe('validateTypes', () => {
  describe.each([
    ['Zod schema', zodSchema],
    ['Custom validator', customValidator],
  ])('using %s', (_, schema) => {
    it('should return validated object for valid input', () => {
      const input = { name: 'John', age: 30 };
      expect(validateTypes({ value: input, schema })).toEqual(input);
    });

    it('should throw TypeValidationError for invalid input', () => {
      const input = { name: 'John', age: '30' };

      try {
        validateTypes({ value: input, schema });
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
          cause: expect.any(Error),
          message: expect.stringContaining('Type validation failed'),
        });
      }
    });
  });
});

describe('safeValidateTypes', () => {
  describe.each([
    ['Zod schema', zodSchema],
    ['Custom validator', customValidator],
  ])('using %s', (_, schema) => {
    it('should return validated object for valid input', () => {
      const input = { name: 'John', age: 30 };
      const result = safeValidateTypes({ value: input, schema });
      expect(result).toEqual({ success: true, value: input });
    });

    it('should return error object for invalid input', () => {
      const input = { name: 'John', age: '30' };
      const result = safeValidateTypes({ value: input, schema });

      expect(result).toEqual({
        success: false,
        error: expect.any(TypeValidationError),
      });

      if (!result.success) {
        expect(result.error).toBeInstanceOf(TypeValidationError);
        expect(result.error.value).toEqual(input);
        expect(result.error.message).toContain('Type validation failed');
      }
    });
  });
});
