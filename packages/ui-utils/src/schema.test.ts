import { describe, it, expect } from 'vitest';
import { jsonSchema } from './schema';
import { z } from 'zod';

describe('jsonSchema', () => {
  it('should create a basic schema without validation', () => {
    const schema = jsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });

    expect(schema.jsonSchema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });
  });

  it('should support custom validation', () => {
    const schema = jsonSchema<{ name: string }>(
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
      {
        validate: value => {
          if (
            typeof value === 'object' &&
            value &&
            'name' in value &&
            typeof (value as { name: string }).name === 'string'
          ) {
            const typedValue = value as { name: string };
            return {
              success: true,
              value: { name: typedValue.name },
              rawValue: typedValue,
            };
          }
          return { success: false, error: new Error('Invalid input') };
        },
      },
    );

    const result = schema.validate?.({ name: 'test' });
    expect(result).toEqual({
      success: true,
      value: { name: 'test' },
      rawValue: { name: 'test' },
    });
  });

  it('should handle validation failures', () => {
    const schema = jsonSchema<{ name: string }>(
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
      {
        validate: value => {
          return { success: false, error: new Error('Always fails') };
        },
      },
    );

    const result = schema.validate?.({ name: 'test' });
    expect(result).toEqual({
      success: false,
      error: expect.any(Error),
    });
  });

  it('should support input/output type transformations', () => {
    type Input = { timestamp: string };
    type Output = { date: Date };

    const schema = jsonSchema<Output, Input>(
      {
        type: 'object',
        properties: {
          timestamp: { type: 'string' },
        },
      },
      {
        validate: value => {
          if (
            typeof value === 'object' &&
            value &&
            'timestamp' in value &&
            typeof (value as { timestamp: string }).timestamp === 'string'
          ) {
            const typedValue = value as Input;
            return {
              success: true,
              value: { date: new Date(typedValue.timestamp) },
              rawValue: typedValue,
            };
          }
          return { success: false, error: new Error('Invalid input') };
        },
      },
    );

    const result = schema.validate?.({ timestamp: '2024-01-01' });
    expect(result).toEqual({
      success: true,
      value: { date: new Date('2024-01-01') },
      rawValue: { timestamp: '2024-01-01' },
    });
  });

  it('should preserve type information', () => {
    const schema = jsonSchema<{ count: number }>({
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    });

    // TypeScript should infer this as { count: number }
    type SchemaType = typeof schema._type;
    const dummy: SchemaType = { count: 42 }; // Should compile
  });
});
