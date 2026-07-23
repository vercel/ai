import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { jsonSchemaToZodShape } from './json-schema-to-zod';

function toObjectSchema(input: unknown) {
  return z.object(jsonSchemaToZodShape(input));
}

describe('jsonSchemaToZodShape', () => {
  it('preserves reporter-style nested tool schemas', () => {
    const schema = toObjectSchema({
      type: 'object',
      properties: {
        input: {
          type: 'object',
          description: 'Record creation parameters.',
          properties: {
            title: {
              type: 'string',
              description: 'The record title.',
            },
            priority: {
              type: 'string',
              description: 'The record priority.',
              enum: ['low', 'medium', 'high'],
            },
            assignee: {
              type: 'object',
              description: 'The person assigned to the record.',
              properties: {
                id: {
                  type: 'string',
                  description: 'The assignee ID.',
                },
                notify: {
                  type: 'boolean',
                  description: 'Whether to notify the assignee.',
                },
              },
              required: ['id'],
              additionalProperties: false,
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      required: ['input'],
      additionalProperties: false,
    });

    expect(
      schema.safeParse({
        input: {
          title: 'Launch plan',
          priority: 'high',
          assignee: { id: 'user_123', notify: true },
        },
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ input: { title: 'Launch plan' } }).success).toBe(
      true,
    );
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ input: {} }).success).toBe(false);
    expect(
      schema.safeParse({ input: { title: 'Launch plan', priority: 'urgent' } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        input: { title: 'Launch plan', assignee: { notify: true } },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        input: {
          title: 'Launch plan',
          assignee: { id: 'user_123', notify: 1 },
        },
      }).success,
    ).toBe(false);
  });

  it('preserves array item types, including arrays of objects', () => {
    const schema = toObjectSchema({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'integer' } },
            required: ['id'],
          },
        },
      },
      required: ['tags', 'records'],
    });

    expect(
      schema.safeParse({ tags: ['alpha'], records: [{ id: 1 }] }).success,
    ).toBe(true);
    expect(schema.safeParse({ tags: [1], records: [{ id: 1 }] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ tags: ['alpha'], records: [{ id: 1.5 }] }).success,
    ).toBe(false);
    expect(schema.safeParse({ tags: ['alpha'], records: [{}] }).success).toBe(
      false,
    );
  });

  it('supports nullable fields from nullable, type arrays, anyOf, and oneOf', () => {
    const schema = toObjectSchema({
      type: 'object',
      properties: {
        nullableString: { type: 'string', nullable: true },
        typedNullableString: { type: ['string', 'null'] },
        anyOfNullableNumber: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
        },
        oneOfNullableBoolean: {
          oneOf: [{ type: 'boolean' }, { type: 'null' }],
        },
      },
      required: [
        'nullableString',
        'typedNullableString',
        'anyOfNullableNumber',
        'oneOfNullableBoolean',
      ],
    });

    expect(
      schema.safeParse({
        nullableString: null,
        typedNullableString: null,
        anyOfNullableNumber: null,
        oneOfNullableBoolean: null,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        nullableString: 'note',
        typedNullableString: 'note',
        anyOfNullableNumber: 1,
        oneOfNullableBoolean: false,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        nullableString: 1,
        typedNullableString: 'note',
        anyOfNullableNumber: 1,
        oneOfNullableBoolean: false,
      }).success,
    ).toBe(false);
  });

  it('supports enum and const values when they are representable literals', () => {
    const schema = toObjectSchema({
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        kind: { const: 'record' },
      },
      required: ['priority', 'kind'],
    });

    expect(schema.safeParse({ priority: 'low', kind: 'record' }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ priority: 'urgent', kind: 'record' }).success,
    ).toBe(false);
    expect(schema.safeParse({ priority: 'low', kind: 'task' }).success).toBe(
      false,
    );
  });

  it('falls back to any for unsupported enum and const values', () => {
    const schema = toObjectSchema({
      type: 'object',
      properties: {
        unsupportedEnum: { enum: [{ nested: true }] },
        unsupportedConst: { const: { nested: true } },
      },
      required: ['unsupportedEnum', 'unsupportedConst'],
    });

    expect(
      schema.safeParse({
        unsupportedEnum: 'anything',
        unsupportedConst: 'anything',
      }).success,
    ).toBe(true);
  });

  it('falls back to any for unsupported non-null type unions', () => {
    const schema = toObjectSchema({
      type: 'object',
      properties: {
        value: { type: ['string', 'number'] },
      },
      required: ['value'],
    });

    expect(schema.safeParse({ value: true }).success).toBe(true);
  });

  it('preserves property descriptions', () => {
    const shape = jsonSchemaToZodShape({
      type: 'object',
      properties: {
        value: { type: 'string', description: 'A described value.' },
      },
    });

    expect(shape.value.description).toBe('A described value.');
  });

  it('returns an empty shape for missing or non-object schemas', () => {
    expect(jsonSchemaToZodShape(undefined)).toEqual({});
    expect(jsonSchemaToZodShape('not a schema')).toEqual({});
  });
});
