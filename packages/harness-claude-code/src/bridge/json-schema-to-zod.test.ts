import { describe, expect, it } from 'vitest';
import {
  jsonSchemaToZodObject,
  type JsonSchemaObject,
} from './json-schema-to-zod';

describe('jsonSchemaToZodObject', () => {
  it.each([
    undefined,
    true,
    {},
    { anyOf: [{ type: 'string' }, { type: 'number' }] },
  ])(
    'preserves open-object parameters with additionalProperties %j',
    additionalProperties => {
      const schema = jsonSchemaToZodObject({
        type: 'object',
        properties: { parameters: { type: 'object', additionalProperties } },
        required: ['parameters'],
      });
      const input = { parameters: { customer: 'cus_example', limit: 1 } };

      expect(schema.parse(input)).toEqual(input);
    },
  );

  describe.each(['root', 'nested'] as const)('%s objects', level => {
    function convert(schema: JsonSchemaObject) {
      return jsonSchemaToZodObject(
        level === 'root'
          ? schema
          : {
              type: 'object',
              properties: { parameters: schema },
              required: ['parameters'],
            },
      );
    }

    function input(parameters: Record<string, unknown>) {
      return level === 'root' ? parameters : { parameters };
    }

    it.each([undefined, true, {}])(
      'preserves extra fields alongside declared properties with additionalProperties %j',
      additionalProperties => {
        const schema = convert({
          type: 'object',
          properties: { customer: { type: 'string' } },
          required: ['customer'],
          additionalProperties,
        });
        const value = input({ customer: 'cus_example', limit: 1 });

        expect(schema.parse(value)).toEqual(value);
        expect(schema.safeParse(input({ limit: 1 })).success).toBe(false);
        expect(schema.safeParse(input({ customer: 123 })).success).toBe(false);
      },
    );

    it('validates typed additional properties without applying them to declared properties', () => {
      const schema = convert({
        type: 'object',
        properties: { customer: { type: 'string' } },
        required: ['customer'],
        additionalProperties: { type: 'integer' },
      });
      const value = input({ customer: 'cus_example', limit: 1 });

      expect(schema.parse(value)).toEqual(value);
      expect(
        schema.safeParse(input({ customer: 'cus_example', limit: '1' }))
          .success,
      ).toBe(false);
      expect(
        schema.safeParse(input({ customer: 'cus_example', limit: 1.5 }))
          .success,
      ).toBe(false);
    });

    it('recursively converts schema-valued additional properties', () => {
      const schema = convert({
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      });
      const value = input({ first: { id: 'cus_example', active: true } });

      expect(schema.parse(value)).toEqual(value);
      expect(schema.safeParse(input({ first: { id: 1 } })).success).toBe(false);
      expect(schema.safeParse(input({ first: {} })).success).toBe(false);
    });

    it.each<Record<string, JsonSchemaObject>>([
      {},
      { customer: { type: 'string' } },
    ])(
      'rejects extra fields when additionalProperties is false with properties %j',
      properties => {
        const schema = convert({
          type: 'object',
          properties,
          additionalProperties: false,
        });

        expect(schema.parse(input({}))).toEqual(input({}));
        expect(schema.safeParse(input({ unexpected: true })).success).toBe(
          false,
        );
      },
    );
  });

  it('preserves open objects inside arrays, unions, and nullable fields', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        records: { type: 'array', items: { type: 'object' } },
        choice: { anyOf: [{ type: 'object' }, { type: 'boolean' }] },
        nullable: { type: ['object', 'null'] },
      },
      required: ['records', 'choice', 'nullable'],
    });
    const record = { customer: 'cus_example', limit: 1 };
    const input = { records: [record], choice: record, nullable: record };

    expect(schema.parse(input)).toEqual(input);
    expect(schema.parse({ ...input, nullable: null })).toEqual({
      ...input,
      nullable: null,
    });
    expect(
      schema.safeParse({ ...input, records: ['not an object'] }).success,
    ).toBe(false);
  });

  it('preserves reporter-style nested tool schemas', () => {
    const schema = jsonSchemaToZodObject({
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
    const schema = jsonSchemaToZodObject({
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
    const schema = jsonSchemaToZodObject({
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

  it('supports recursive anyOf and oneOf unions', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        primitive: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
        nested: {
          oneOf: [
            { type: 'boolean' },
            {
              type: 'object',
              properties: { id: { type: 'integer' } },
              required: ['id'],
            },
          ],
        },
        values: {
          type: 'array',
          items: {
            anyOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
      },
      required: ['primitive', 'nested', 'values'],
    });

    expect(
      schema.safeParse({
        primitive: 'text',
        nested: { id: 1 },
        values: ['text', 1],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ primitive: 1, nested: false, values: [] }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ primitive: true, nested: false, values: [] }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ primitive: 1, nested: 'text', values: [] }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ primitive: 1, nested: false, values: [true] }).success,
    ).toBe(false);
  });

  it('keeps the safe fallback for unsupported union branches', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        value: {
          anyOf: [{ type: 'string' }, { allOf: [{ type: 'number' }] }],
        },
      },
      required: ['value'],
    });

    expect(schema.safeParse({ value: true }).success).toBe(true);
  });

  it('supports enum and const values when they are representable literals', () => {
    const schema = jsonSchemaToZodObject({
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
    const schema = jsonSchemaToZodObject({
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
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        value: { type: ['string', 'number'] },
      },
      required: ['value'],
    });

    expect(schema.safeParse({ value: true }).success).toBe(true);
  });

  it('preserves property descriptions', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        value: { type: 'string', description: 'A described value.' },
      },
    });

    expect(schema.shape.value.description).toBe('A described value.');
  });

  it.each([undefined, 'not a schema'])(
    'returns an open object for invalid schema %j',
    input => {
      const value = { customer: 'cus_example' };
      expect(jsonSchemaToZodObject(input).parse(value)).toEqual(value);
    },
  );
});
