import { z } from 'zod';
import { getOutputStrategy } from './output-strategy';
import { TypeValidationError } from '@ai-sdk/provider';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { NoObjectGeneratedError } from '../../errors/no-object-generated-error';

describe('noSchemaOutputStrategy', () => {
  const strategy = getOutputStrategy({ output: 'no-schema' });

  it('should validate partial results without schema', () => {
    const result = strategy.validatePartialResult({
      value: { test: 'value' },
      textDelta: 'delta',
      isFirstDelta: true,
      isFinalDelta: false,
      latestObject: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual({
        partial: { test: 'value' },
        textDelta: 'delta',
      });
    }
  });

  it('should fail validation when no final value is provided', () => {
    const result = strategy.validateFinalResult(undefined, {
      text: 'test',
      response: {
        id: 'test-id',
        timestamp: new Date(),
        modelId: 'test-model',
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(NoObjectGeneratedError);
    }
  });

  it('should throw error when trying to create element stream', () => {
    expect(() => strategy.createElementStream({} as any)).toThrow(
      UnsupportedFunctionalityError,
    );
  });
});

describe('objectOutputStrategy', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });
  const strategy = getOutputStrategy({ output: 'object', schema });

  it('should validate partial results', () => {
    const result = strategy.validatePartialResult({
      value: { name: 'John', age: 30 },
      textDelta: 'delta',
      isFirstDelta: true,
      isFinalDelta: false,
      latestObject: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.partial).toEqual({ name: 'John', age: 30 });
    }
  });

  it('should validate final results against schema', () => {
    const result = strategy.validateFinalResult(
      { name: 'John', age: 30 },
      {
        text: 'test',
        response: {
          id: 'test-id',
          timestamp: new Date(),
          modelId: 'test-model',
        },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual({ name: 'John', age: 30 });
    }
  });

  it('should fail validation for invalid final results', () => {
    const result = strategy.validateFinalResult(
      { name: 'John', age: '30' },
      {
        text: 'test',
        response: {
          id: 'test-id',
          timestamp: new Date(),
          modelId: 'test-model',
        },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TypeValidationError);
    }
  });
});

describe('arrayOutputStrategy', () => {
  const elementSchema = z.object({
    id: z.number(),
    name: z.string(),
  });
  const strategy = getOutputStrategy({
    output: 'array',
    schema: elementSchema,
  });

  it('should validate partial array results', () => {
    const result = strategy.validatePartialResult({
      value: { elements: [{ id: 1, name: 'John' }] },
      textDelta: '',
      isFirstDelta: true,
      isFinalDelta: true,
      latestObject: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.partial).toEqual([{ id: 1, name: 'John' }]);
    }
  });

  it('should fail validation for invalid array structure', () => {
    const result = strategy.validatePartialResult({
      value: [{ id: 1, name: 'John' }], // Missing elements wrapper
      textDelta: '',
      isFirstDelta: true,
      isFinalDelta: false,
      latestObject: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TypeValidationError);
    }
  });
});

describe('enumOutputStrategy', () => {
  const enumValues = ['RED', 'GREEN', 'BLUE'];
  const strategy = getOutputStrategy({
    output: 'enum',
    enumValues,
  });

  it('should validate valid enum values', () => {
    const result = strategy.validateFinalResult(
      { result: 'RED' },
      {
        text: 'test',
        response: {
          id: 'test-id',
          timestamp: new Date(),
          modelId: 'test-model',
        },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('RED');
    }
  });

  it('should fail validation for invalid enum values', () => {
    const result = strategy.validateFinalResult(
      { result: 'YELLOW' },
      {
        text: 'test',
        response: {
          id: 'test-id',
          timestamp: new Date(),
          modelId: 'test-model',
        },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TypeValidationError);
    }
  });

  it('should throw error for partial results', () => {
    expect(() =>
      strategy.validatePartialResult({
        value: { result: 'RED' },
        textDelta: '',
        isFirstDelta: true,
        isFinalDelta: false,
        latestObject: undefined,
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
