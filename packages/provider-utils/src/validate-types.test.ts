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
    ? {
        success: true,
        value: value as { name: string; age: number },
        rawValue: value as { name: string; age: number },
      }
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
      expect(result).toEqual({ success: true, value: input, rawValue: input });
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

describe('type transformations', () => {
  const transformSchema = z.object({
    id: z.string().transform(val => {
      const num = parseInt(val, 10);
      if (isNaN(num)) throw new Error('Invalid number');
      return num;
    }),
    name: z.string(),
  });

  const transformValidator = validator<
    { id: number; name: string },
    { id: string; name: string }
  >(value => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'name' in value &&
      typeof value.name === 'string'
    ) {
      const num = parseInt(value.id, 10);
      if (isNaN(num)) {
        return { success: false, error: new Error('Invalid number') };
      }
      return {
        success: true,
        value: { id: num, name: value.name },
        rawValue: value as { id: string; name: string },
      };
    }
    return { success: false, error: new Error('Invalid input') };
  });

  describe.each([
    ['Zod schema', transformSchema],
    ['Custom validator', transformValidator],
  ])('using %s', (_, schema) => {
    const validInput = { id: '123', name: 'John' };
    const expectedOutput = { id: 123, name: 'John' };

    it('should transform types in validateTypes', () => {
      const result = validateTypes({ value: validInput, schema });
      expect(result).toEqual(expectedOutput);
    });

    it('should transform types in safeValidateTypes', () => {
      const result = safeValidateTypes({ value: validInput, schema });
      expect(result).toEqual({
        success: true,
        value: expectedOutput,
        rawValue: validInput,
      });
    });

    it('should handle invalid transformations', () => {
      const invalidInput = { id: 'not-a-number', name: 'John' };
      const result = safeValidateTypes({ value: invalidInput, schema });
      expect(result).toEqual({
        success: false,
        error: expect.any(TypeValidationError),
      });
    });
  });
});
