import { describe, it, expect } from 'vitest';
import { parseJSON, safeParseJSON, isParsableJson } from './parse-json';
import { z } from 'zod';
import { JSONParseError, TypeValidationError } from '@ai-sdk/provider';

describe('parseJSON', () => {
  it('should parse basic JSON without schema', () => {
    const result = parseJSON({ text: '{"foo": "bar"}' });
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should parse JSON with schema validation', () => {
    const schema = z.object({ foo: z.string() });
    const result = parseJSON({ text: '{"foo": "bar"}', schema });
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should throw JSONParseError for invalid JSON', () => {
    expect(() => parseJSON({ text: 'invalid json' })).toThrow(JSONParseError);
  });

  it('should throw TypeValidationError for schema validation failures', () => {
    const schema = z.object({ foo: z.number() });
    expect(() => parseJSON({ text: '{"foo": "bar"}', schema })).toThrow(
      TypeValidationError,
    );
  });
});

describe('safeParseJSON', () => {
  it('should safely parse basic JSON without schema and include rawValue', () => {
    const result = safeParseJSON({ text: '{"foo": "bar"}' });
    expect(result).toEqual({
      success: true,
      value: { foo: 'bar' },
      rawValue: { foo: 'bar' },
    });
  });

  it('should preserve rawValue even after schema transformation', () => {
    const schema = z.object({
      count: z.coerce.number(),
    });
    const result = safeParseJSON({
      text: '{"count": "42"}',
      schema,
    });

    expect(result).toEqual({
      success: true,
      value: { count: 42 },
      rawValue: { count: '42' },
    });
  });

  it('should handle failed parsing with error details', () => {
    const result = safeParseJSON({ text: 'invalid json' });
    expect(result).toEqual({
      success: false,
      error: expect.any(JSONParseError),
    });
  });

  it('should handle schema validation failures', () => {
    const schema = z.object({ age: z.number() });
    const result = safeParseJSON({
      text: '{"age": "twenty"}',
      schema,
    });

    expect(result).toEqual({
      success: false,
      error: expect.any(TypeValidationError),
    });
  });

  it('should handle nested objects and preserve raw values', () => {
    const schema = z.object({
      user: z.object({
        id: z.coerce.number(),
        name: z.string(),
      }),
    });

    const result = safeParseJSON({
      text: '{"user": {"id": "123", "name": "John"}}',
      schema: schema,
    });

    expect(result).toEqual({
      success: true,
      value: { user: { id: 123, name: 'John' } },
      rawValue: { user: { id: '123', name: 'John' } },
    });
  });

  it('should handle arrays and preserve raw values', () => {
    const schema = z.array(z.string().transform(val => val.toUpperCase()));
    const result = safeParseJSON({
      text: '["hello", "world"]',
      schema,
    });

    expect(result).toEqual({
      success: true,
      value: ['HELLO', 'WORLD'],
      rawValue: ['hello', 'world'],
    });
  });

  it('should handle discriminated unions in schema', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), content: z.string() }),
      z.object({ type: z.literal('number'), value: z.number() }),
    ]);

    const result = safeParseJSON({
      text: '{"type": "text", "content": "hello"}',
      schema,
    });

    expect(result).toEqual({
      success: true,
      value: { type: 'text', content: 'hello' },
      rawValue: { type: 'text', content: 'hello' },
    });
  });

  it('should handle nullable fields in schema', () => {
    const schema = z.object({
      id: z.string().nullish(),
      data: z.string(),
    });

    const result = safeParseJSON({
      text: '{"id": null, "data": "test"}',
      schema,
    });

    expect(result).toEqual({
      success: true,
      value: { id: null, data: 'test' },
      rawValue: { id: null, data: 'test' },
    });
  });

  it('should handle union types in schema', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });

    const result1 = safeParseJSON({
      text: '{"value": "test"}',
      schema,
    });

    const result2 = safeParseJSON({
      text: '{"value": 123}',
      schema,
    });

    expect(result1).toEqual({
      success: true,
      value: { value: 'test' },
      rawValue: { value: 'test' },
    });

    expect(result2).toEqual({
      success: true,
      value: { value: 123 },
      rawValue: { value: 123 },
    });
  });
});

describe('isParsableJson', () => {
  it('should return true for valid JSON', () => {
    expect(isParsableJson('{"foo": "bar"}')).toBe(true);
    expect(isParsableJson('[1, 2, 3]')).toBe(true);
    expect(isParsableJson('"hello"')).toBe(true);
  });

  it('should return false for invalid JSON', () => {
    expect(isParsableJson('invalid')).toBe(false);
    expect(isParsableJson('{foo: "bar"}')).toBe(false);
    expect(isParsableJson('{"foo": }')).toBe(false);
  });
});
