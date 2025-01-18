import { z } from 'zod';
import {
  validator,
  isValidator,
  asValidator,
  zodValidator,
  validatorSymbol,
  ValidationResult,
} from './validator';
import { fail } from 'assert';

describe('validator', () => {
  it('should create a validator with validate function', () => {
    const validate = (value: unknown): ValidationResult<string> => ({
      success: true as const,
      value: value as string,
      rawValue: value as string,
    });
    const v = validator(validate);
    expect(v[validatorSymbol]).toBe(true);
    expect(v.validate).toBe(validate);
  });

  it('should create a validator without validate function', () => {
    const v = validator();
    expect(v[validatorSymbol]).toBe(true);
    expect(v.validate).toBeUndefined();
  });
});

describe('isValidator', () => {
  it('should return true for valid validators', () => {
    const v = validator(() => ({
      success: true,
      value: 'test',
      rawValue: 'test',
    }));
    expect(isValidator(v)).toBe(true);
  });

  it('should return false for non-validators', () => {
    expect(isValidator(null)).toBe(false);
    expect(isValidator({})).toBe(false);
    expect(isValidator({ [validatorSymbol]: true })).toBe(false);
    expect(isValidator({ validate: () => ({}) })).toBe(false);
  });
});

describe('zodValidator', () => {
  const schema = z.string().transform(val => val.length);

  it('should create a validator from zod schema', () => {
    const v = zodValidator(schema);
    expect(isValidator(v)).toBe(true);
  });

  it('should handle successful validation', () => {
    const v = zodValidator(schema);
    const result = v.validate?.('test');
    expect(result).toEqual({
      success: true,
      value: 4,
      rawValue: 'test',
    });
  });

  it('should handle validation failure', () => {
    const v = zodValidator(schema);
    const result = v.validate?.(123);
    if (!result) {
      fail('Expected validate function to be defined');
    }
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError);
    } else {
      fail('Expected validation to fail');
    }
  });
});

describe('asValidator', () => {
  it('should return existing validator unchanged', () => {
    const v = validator(() => ({
      success: true,
      value: 'test',
      rawValue: 'test',
    }));
    expect(asValidator(v)).toBe(v);
  });

  it('should convert zod schema to validator', () => {
    const schema = z.string();
    const v = asValidator(schema);
    expect(isValidator(v)).toBe(true);

    const result = v.validate?.('test');
    expect(result).toEqual({
      success: true,
      value: 'test',
      rawValue: 'test',
    });
  });

  it('should handle type transformations', () => {
    const schema = z.string().transform(val => parseInt(val, 10));
    const v = asValidator(schema);

    const result = v.validate?.('123');
    expect(result).toEqual({
      success: true,
      value: 123,
      rawValue: '123',
    });
  });
});
