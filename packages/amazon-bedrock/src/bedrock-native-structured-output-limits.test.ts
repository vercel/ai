import type { JSONSchema7 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  checkNativeStructuredOutputLimits,
  countOptionalParameters,
  countUnionTypedParameters,
} from './bedrock-native-structured-output-limits';

function objectWithProperties(
  properties: Record<string, JSONSchema7>,
  required: string[] = [],
): JSONSchema7 {
  return { type: 'object', properties, required, additionalProperties: false };
}

describe('countUnionTypedParameters', () => {
  it('counts anyOf, oneOf, and type-array nodes across the tree', () => {
    const schema = objectWithProperties(
      {
        nullable: { type: ['string', 'null'] },
        either: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        choice: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        plain: { type: 'string' },
        list: { type: 'array', items: { type: ['integer', 'null'] } },
      },
      ['nullable', 'either', 'choice', 'plain', 'list'],
    );

    // nullable + either + choice + list.items = 4
    expect(countUnionTypedParameters(schema)).toBe(4);
  });

  it('counts union nodes inside $defs once and ignores $ref nodes', () => {
    const schema = {
      type: 'object',
      $defs: {
        MaybeString: { type: ['string', 'null'] },
      },
      properties: {
        a: { $ref: '#/$defs/MaybeString' },
        b: { $ref: '#/$defs/MaybeString' },
      },
      required: ['a', 'b'],
    } as JSONSchema7;

    expect(countUnionTypedParameters(schema)).toBe(1);
  });
});

describe('countOptionalParameters', () => {
  it('counts properties not listed in required, recursively', () => {
    const schema = objectWithProperties(
      {
        required1: { type: 'string' },
        optional1: { type: 'string' },
        nested: objectWithProperties(
          {
            required2: { type: 'string' },
            optional2: { type: 'string' },
            optional3: { type: 'string' },
          },
          ['required2'],
        ),
      },
      ['required1', 'nested'],
    );

    // optional1 + optional2 + optional3 = 3
    expect(countOptionalParameters(schema)).toBe(3);
  });
});

describe('checkNativeStructuredOutputLimits', () => {
  it('is within limits for a small schema', () => {
    const result = checkNativeStructuredOutputLimits(
      objectWithProperties({ name: { type: 'string' } }, ['name']),
    );
    expect(result.withinLimits).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('flags schemas over the union-parameter limit', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => [
        `field${i}`,
        { type: ['string', 'null'] } as JSONSchema7,
      ]),
    );
    const result = checkNativeStructuredOutputLimits(
      objectWithProperties(properties, Object.keys(properties)),
    );
    expect(result.withinLimits).toBe(false);
    expect(result.unionParameterCount).toBe(17);
    expect(result.reason).toContain('union-typed parameters');
  });

  it('flags schemas over the optional-parameter limit', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `field${i}`,
        { type: 'string' } as JSONSchema7,
      ]),
    );
    // No required entries => all 25 are optional, over the limit of 24.
    const result = checkNativeStructuredOutputLimits(
      objectWithProperties(properties, []),
    );
    expect(result.withinLimits).toBe(false);
    expect(result.optionalParameterCount).toBe(25);
    expect(result.reason).toContain('optional parameters');
  });
});
