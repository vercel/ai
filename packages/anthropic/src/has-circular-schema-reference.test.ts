import type { JSONSchema7 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { hasCircularSchemaReference } from './has-circular-schema-reference';

describe('hasCircularSchemaReference', () => {
  it('returns false for a schema without references', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: { name: { type: 'string' } },
      }),
    ).toBe(false);
  });

  it('returns false for shared definitions without a cycle', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: {
          home: { $ref: '#/$defs/address' },
          work: { $ref: '#/$defs/address' },
        },
        $defs: {
          address: {
            type: 'object',
            properties: { country: { $ref: '#/$defs/country' } },
          },
          country: { type: 'string' },
        },
      }),
    ).toBe(false);
  });

  it('returns false for a top-level $ref to a non-recursive definition', () => {
    expect(
      hasCircularSchemaReference({
        $ref: '#/definitions/Answer',
        definitions: {
          Answer: {
            type: 'object',
            properties: { answer: { type: 'string' } },
          },
        },
      } as JSONSchema7),
    ).toBe(false);
  });

  it('detects a self-referencing definition', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: { root: { $ref: '#/$defs/node' } },
        $defs: {
          node: {
            type: 'object',
            properties: {
              children: { type: 'array', items: { $ref: '#/$defs/node' } },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it('detects mutually referencing definitions', () => {
    expect(
      hasCircularSchemaReference({
        $ref: '#/definitions/a',
        definitions: {
          a: { type: 'object', properties: { b: { $ref: '#/definitions/b' } } },
          b: { type: 'object', properties: { a: { $ref: '#/definitions/a' } } },
        },
      } as JSONSchema7),
    ).toBe(true);
  });

  it('detects a reference to the root schema', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: { parent: { anyOf: [{ $ref: '#' }, { type: 'null' }] } },
      }),
    ).toBe(true);
  });

  it('ignores cycles in definitions that are never referenced', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: { name: { type: 'string' } },
        $defs: { node: { items: { $ref: '#/$defs/node' } } },
      } as JSONSchema7),
    ).toBe(false);
  });

  it('treats properties named like keywords as subschemas', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: {
          definitions: { $ref: '#/$defs/node' },
          $ref: { type: 'string' },
        },
        $defs: {
          node: {
            type: 'object',
            properties: { next: { $ref: '#/$defs/node' } },
          },
        },
      } as JSONSchema7),
    ).toBe(true);
  });

  it('ignores $ref keys inside instance data', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        default: { $ref: '#' },
        properties: { kind: { enum: [{ $ref: '#' }] } },
      } as JSONSchema7),
    ).toBe(false);
  });

  it('returns false for unresolvable or remote references', () => {
    expect(
      hasCircularSchemaReference({
        type: 'object',
        properties: {
          a: { $ref: '#/$defs/missing' },
          b: { $ref: 'https://example.com/schema.json' },
          c: { $ref: '#/%E0%A4%A' },
        },
      }),
    ).toBe(false);
  });
});
