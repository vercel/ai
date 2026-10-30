import type { JSONSchema7 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { supportsNativeStructuredOutputSchema } from './supports-native-structured-output-schema';

const strings = (count: number, prefix = 'f') =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${prefix}${i}`,
      { type: 'string' as const },
    ]),
  );

const optionalObject = (count: number, prefix = 'f'): JSONSchema7 => ({
  type: 'object',
  properties: strings(count, prefix),
  additionalProperties: false,
});

describe('supportsNativeStructuredOutputSchema', () => {
  it('accepts a closed object', () => {
    expect(
      supportsNativeStructuredOutputSchema({
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      }),
    ).toBe(true);
  });

  it('accepts an object without additionalProperties that has properties', () => {
    expect(
      supportsNativeStructuredOutputSchema({
        type: 'object',
        properties: { answer: { type: 'string' } },
      }),
    ).toBe(true);
  });

  it('accepts many required properties', () => {
    const properties = strings(60);
    expect(
      supportsNativeStructuredOutputSchema({
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      }),
    ).toBe(true);
  });

  it('rejects self-referencing schemas', () => {
    expect(
      supportsNativeStructuredOutputSchema({
        type: 'object',
        properties: { root: { $ref: '#/$defs/node' } },
        $defs: {
          node: {
            type: 'object',
            properties: { children: { items: { $ref: '#/$defs/node' } } },
          },
        },
      } as JSONSchema7),
    ).toBe(false);
  });

  describe('open objects', () => {
    it.each([
      ['a map', { type: 'object', additionalProperties: { type: 'number' } }],
      [
        'additionalProperties: true',
        { type: 'object', additionalProperties: true },
      ],
      ['a free-form object', { type: 'object' }],
      [
        'patternProperties',
        { type: 'object', patternProperties: { '^x-': { type: 'string' } } },
      ],
    ] as Array<[string, JSONSchema7]>)('rejects %s', (_, field) => {
      expect(
        supportsNativeStructuredOutputSchema({
          type: 'object',
          properties: { field },
          required: ['field'],
          additionalProperties: false,
        }),
      ).toBe(false);
    });

    it('rejects an open object reached through a $ref', () => {
      expect(
        supportsNativeStructuredOutputSchema({
          type: 'object',
          properties: { scores: { $ref: '#/$defs/Scores' } },
          required: ['scores'],
          additionalProperties: false,
          $defs: {
            Scores: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
        } as JSONSchema7),
      ).toBe(false);
    });

    it('accepts an empty closed object', () => {
      expect(
        supportsNativeStructuredOutputSchema({
          type: 'object',
          additionalProperties: false,
        }),
      ).toBe(true);
    });
  });

  describe('optional properties', () => {
    it('accepts 10 optional properties', () => {
      expect(supportsNativeStructuredOutputSchema(optionalObject(10))).toBe(
        true,
      );
    });

    it('rejects 11 optional properties', () => {
      expect(supportsNativeStructuredOutputSchema(optionalObject(11))).toBe(
        false,
      );
    });

    it('counts optional properties across nested objects', () => {
      expect(
        supportsNativeStructuredOutputSchema({
          type: 'object',
          properties: { a: { type: 'string' }, nested: optionalObject(10) },
          required: ['nested'],
          additionalProperties: false,
        }),
      ).toBe(false);
    });

    it('counts optional properties in array items and union branches', () => {
      expect(
        supportsNativeStructuredOutputSchema({
          type: 'object',
          properties: {
            items: { type: 'array', items: optionalObject(5, 'i') },
            union: { anyOf: [optionalObject(3, 'a'), optionalObject(3, 'b')] },
          },
          required: ['items', 'union'],
          additionalProperties: false,
        }),
      ).toBe(false);
    });

    it('counts a referenced definition at every use', () => {
      const schema = (count: number) =>
        ({
          type: 'object',
          properties: {
            x: { $ref: '#/$defs/D' },
            y: { $ref: '#/$defs/D' },
          },
          required: ['x', 'y'],
          additionalProperties: false,
          $defs: { D: optionalObject(count, 'd') },
        }) as JSONSchema7;

      expect(supportsNativeStructuredOutputSchema(schema(5))).toBe(true);
      expect(supportsNativeStructuredOutputSchema(schema(6))).toBe(false);
    });

    it('ignores definitions that are never referenced', () => {
      expect(
        supportsNativeStructuredOutputSchema({
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
          $defs: { Unused: optionalObject(30, 'u') },
        } as JSONSchema7),
      ).toBe(true);
    });
  });
});
