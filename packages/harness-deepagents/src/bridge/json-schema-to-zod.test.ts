import { tool } from '@langchain/core/tools';
import { describe, expect, it } from 'vitest';
import { jsonSchemaToZodObject } from './json-schema-to-zod';

describe('jsonSchemaToZodObject', () => {
  it('handles flat scalar properties with required/optional', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { city: { type: 'string' }, days: { type: 'integer' } },
      required: ['city'],
    });
    expect(schema.safeParse({ city: 'Paris' }).success).toBe(true);
    expect(schema.safeParse({ city: 'Paris', days: 3 }).success).toBe(true);
    expect(schema.safeParse({ days: 3 }).success).toBe(false);
    expect(schema.safeParse({ city: 'Paris', days: 1.5 }).success).toBe(false);
  });

  it('preserves nested object structure (the flat converter dropped this)', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['status'],
        },
      },
      required: ['filter'],
    });
    expect(
      schema.safeParse({ filter: { status: 'open', limit: 10 } }).success,
    ).toBe(true);
    // nested required field enforced — impossible with the old z.record(unknown)
    expect(schema.safeParse({ filter: { limit: 10 } }).success).toBe(false);
    expect(schema.safeParse({ filter: { status: 5 } }).success).toBe(false);
  });

  it('preserves array item types', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
      required: ['tags'],
    });
    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true);
    expect(schema.safeParse({ tags: [1, 2] }).success).toBe(false);
  });

  it('supports arrays of objects', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'integer' } },
            required: ['id'],
          },
        },
      },
    });
    expect(schema.safeParse({ items: [{ id: 1 }] }).success).toBe(true);
    expect(schema.safeParse({ items: [{ id: 'x' }] }).success).toBe(false);
  });

  it('honors nullable', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { note: { type: 'string', nullable: true } },
      required: ['note'],
    });
    expect(schema.safeParse({ note: null }).success).toBe(true);
    expect(schema.safeParse({ note: 'hi' }).success).toBe(true);
  });

  it('honors nullable from a type array', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        cursor: { type: ['string', 'null'] },
        filter: {
          type: ['object', 'null'],
          properties: { status: { type: 'string' } },
        },
      },
      required: ['cursor', 'filter'],
    });
    expect(schema.safeParse({ cursor: null, filter: null }).success).toBe(true);
    expect(
      schema.safeParse({ cursor: 'abc', filter: { status: 'open' } }).success,
    ).toBe(true);
    expect(schema.safeParse({ cursor: 1, filter: null }).success).toBe(false);
  });

  it.each([undefined, true, {}])(
    'keeps fields of open objects with additionalProperties %j',
    additionalProperties => {
      const schema = jsonSchemaToZodObject({
        type: 'object',
        properties: {
          parameters: { type: 'object', additionalProperties },
          filter: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status'],
            additionalProperties,
          },
        },
        required: ['parameters', 'filter'],
        additionalProperties,
      });
      const input = {
        parameters: { customer: 'cus_example', limit: 1 },
        filter: { status: 'open', limit: 10 },
        extra: true,
      };
      expect(schema.parse(input)).toEqual(input);
      expect(
        schema.safeParse({ ...input, filter: { limit: 10 } }).success,
      ).toBe(false);
    },
  );

  it('validates typed additional properties', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        counts: { type: 'object', additionalProperties: { type: 'integer' } },
      },
      required: ['counts'],
    });
    expect(schema.parse({ counts: { a: 1, b: 2 } })).toEqual({
      counts: { a: 1, b: 2 },
    });
    expect(schema.safeParse({ counts: { a: 'one' } }).success).toBe(false);
  });

  it('still drops extra fields when additionalProperties is false', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    });
    expect(schema.parse({ city: 'Paris', extra: true })).toEqual({
      city: 'Paris',
    });
  });

  it('passes open-object fields and nulls through a LangChain tool', async () => {
    const calls: unknown[] = [];
    const hostTool = tool(
      async input => {
        calls.push(input);
        return 'ok';
      },
      {
        name: 'call_api',
        description: '',
        schema: jsonSchemaToZodObject({
          type: 'object',
          properties: {
            parameters: { type: 'object' },
            cursor: { type: ['string', 'null'] },
          },
          required: ['parameters', 'cursor'],
        }),
      },
    );

    await hostTool.invoke({
      parameters: { customer: 'cus_example', limit: 1 },
      cursor: null,
    });

    expect(calls).toEqual([
      { parameters: { customer: 'cus_example', limit: 1 }, cursor: null },
    ]);
  });

  it('returns an empty object schema for a missing/!object input', () => {
    expect(jsonSchemaToZodObject(undefined).safeParse({}).success).toBe(true);
  });
});
