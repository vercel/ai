import {
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type JSONSchema7,
  type LanguageModelV4FunctionTool,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  needsToolInputWrapping,
  unwrapToolInput,
  wrapToolInput,
  wrapToolInputSchema,
} from './anthropic-tool-input';

describe('Anthropic tool input wrapping', () => {
  it.each([
    {},
    { type: 'string' },
    { type: 'array', items: { type: 'number' } },
    { type: ['object', 'null'] },
    { anyOf: [{ type: 'object' }] },
    { type: 'object', oneOf: [{ type: 'object' }] },
    { type: 'object', allOf: [{ type: 'object' }] },
    { type: 'object', $ref: '#/definitions/input' },
  ] satisfies JSONSchema7[])('wraps incompatible roots: %j', schema => {
    expect(needsToolInputWrapping(schema)).toBe(true);
    expect(
      wrapToolInputSchema({
        type: 'function',
        name: 'lookup',
        inputSchema: schema,
      }).inputSchema,
    ).toMatchObject({
      type: 'object',
      required: ['__ai_sdk_tool_input'],
      additionalProperties: false,
    });
  });

  it('does not require wrapping for object roots with nested unions', () => {
    expect(
      needsToolInputWrapping({
        type: 'object',
        properties: {
          request: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        },
      }),
    ).toBe(false);
  });

  it('wraps examples without changing the original tool or schema', () => {
    const tool: LanguageModelV4FunctionTool = {
      type: 'function',
      name: 'lookup',
      strict: true,
      inputSchema: { oneOf: [{ type: 'object' }, { type: 'null' }] },
      inputExamples: [{ input: { id: '123' } }],
    };
    const original = structuredClone(tool);
    const wrapped = wrapToolInputSchema(tool);

    expect(tool).toEqual(original);
    expect(wrapped.strict).toBe(true);
    expect(wrapped.inputSchema.properties?.__ai_sdk_tool_input).toEqual(
      tool.inputSchema,
    );
    expect(wrapped.inputExamples).toEqual([
      { input: { __ai_sdk_tool_input: { id: '123' } } },
    ]);
  });

  it('relocates document pointers and leaves literal values alone', () => {
    const literal = { $ref: '#/definitions/node', $id: 'application-data' };
    const inputSchema: JSONSchema7 = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/definitions/node',
      definitions: {
        node: {
          type: 'object',
          properties: {
            child: { $ref: '#' },
            sibling: { $ref: '#/definitions/node' },
            encoded: { $ref: '#%2Fdefinitions%2Fnode' },
            literal: { const: literal, enum: [literal], default: literal },
          },
        },
      },
    };
    const original = structuredClone(inputSchema);
    const wrapped = wrapToolInputSchema({
      type: 'function',
      name: 'lookup',
      inputSchema,
    });
    const nested = wrapped.inputSchema.properties
      ?.__ai_sdk_tool_input as JSONSchema7;
    const node = nested.definitions?.node as JSONSchema7;

    expect(wrapped.inputSchema.$schema).toBe(inputSchema.$schema);
    expect(nested.$ref).toBe(
      '#/properties/__ai_sdk_tool_input/definitions/node',
    );
    expect(node.properties).toEqual({
      child: { $ref: '#/properties/__ai_sdk_tool_input' },
      sibling: { $ref: '#/properties/__ai_sdk_tool_input/definitions/node' },
      encoded: {
        $ref: '#/properties/__ai_sdk_tool_input%2Fdefinitions%2Fnode',
      },
      literal: { const: literal, enum: [literal], default: literal },
    });
    expect(inputSchema).toEqual(original);
  });

  it('relocates references in schema keywords across supported dialects', () => {
    const ref = { $ref: '#/$defs/input' };
    const schema = {
      $defs: { input: { type: 'string' } },
      anyOf: [ref],
      oneOf: [ref],
      allOf: [ref],
      not: ref,
      if: ref,
      // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema conditional keyword
      then: ref,
      else: ref,
      items: [ref, true],
      prefixItems: [ref],
      additionalItems: ref,
      contains: ref,
      propertyNames: ref,
      additionalProperties: ref,
      unevaluatedItems: ref,
      unevaluatedProperties: ref,
      dependentSchemas: { value: ref },
      dependencies: { value: ref, other: ['value'] },
      patternProperties: { '.*': ref },
    };
    const wrapped = wrapToolInputSchema({
      type: 'function',
      name: 'lookup',
      inputSchema: schema as JSONSchema7,
    });
    const expectedRef = {
      $ref: '#/properties/__ai_sdk_tool_input/$defs/input',
    };

    expect(wrapped.inputSchema.properties?.__ai_sdk_tool_input).toEqual({
      ...schema,
      anyOf: [expectedRef],
      oneOf: [expectedRef],
      allOf: [expectedRef],
      not: expectedRef,
      if: expectedRef,
      // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema conditional keyword
      then: expectedRef,
      else: expectedRef,
      items: [expectedRef, true],
      prefixItems: [expectedRef],
      additionalItems: expectedRef,
      contains: expectedRef,
      propertyNames: expectedRef,
      additionalProperties: expectedRef,
      unevaluatedItems: expectedRef,
      unevaluatedProperties: expectedRef,
      dependentSchemas: { value: expectedRef },
      dependencies: { value: expectedRef, other: ['value'] },
      patternProperties: { '.*': expectedRef },
    });
  });

  it.each([
    { $id: 'https://example.com/schema' },
    { $ref: 'https://example.com/schema' },
    { $ref: '#anchor' },
    { $ref: '#/%zz' },
    { anyOf: [{ $id: 'nested' }] },
    { $dynamicRef: '#' },
    { $recursiveRef: '#' },
  ])('rejects references that cannot be safely relocated: %j', inputSchema => {
    expect(() =>
      wrapToolInputSchema({
        type: 'function',
        name: 'lookup',
        inputSchema: inputSchema as JSONSchema7,
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it.each([
    null,
    false,
    0,
    '',
    [1, 2],
    { id: '123' },
    { __ai_sdk_tool_input: 'user value' },
  ])('round-trips input without losing values: %j', input => {
    expect(unwrapToolInput(wrapToolInput(input), 'lookup')).toEqual(input);
  });

  it.each([{}, { __ai_sdk_tool_input: {}, extra: 1 }, [], null, 'text'])(
    'rejects malformed wrappers: %j',
    input => {
      expect(() => unwrapToolInput(input, 'lookup')).toThrow(
        InvalidResponseDataError,
      );
    },
  );
});
