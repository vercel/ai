import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
} from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  lazySchema,
  tool,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { anthropic } from './anthropic-provider';
import { experimental_validateAnthropicToolSchemas as validateToolSchemas } from './index';

describe('validateAnthropicToolSchemas', () => {
  it.each([
    ['missing type', {}],
    ['string', { type: 'string' }],
    ['array', { type: 'array', items: { type: 'string' } }],
    ['nullable object', { type: ['object', 'null'] }],
    ['root reference', { $ref: '#/definitions/input' }],
    ...(['anyOf', 'oneOf', 'allOf'] as const).flatMap(keyword => [
      [keyword, { [keyword]: [{ type: 'object' }] }],
      [
        `object with ${keyword}`,
        { type: 'object', [keyword]: [{ type: 'object' }] },
      ],
    ]),
  ] as Array<[string, JSONSchema7]>)(
    'rejects %s with an actionable error',
    async (_, schema) => {
      const result = validateToolSchemas({
        tools: { lookup: tool({ inputSchema: jsonSchema(schema) }) },
      });

      await expect(result).rejects.toBeInstanceOf(
        UnsupportedFunctionalityError,
      );
      await expect(result).rejects.toMatchObject({
        functionality: 'Anthropic tool input schema',
        message:
          "Tool 'lookup' has an unsupported input schema for Anthropic. " +
          "Use type 'object' at the root, without anyOf, oneOf, or allOf. " +
          'Wrap the schema in an object property, e.g. z.object({ request: schema }).',
      });
    },
  );

  it.each([
    {
      name: 'Zod 3',
      request: z3.discriminatedUnion('action', [
        z3.object({ action: z3.literal('lookup'), id: z3.string() }),
        z3.object({ action: z3.literal('search'), query: z3.string() }),
      ]),
    },
    {
      name: 'Zod 4',
      request: z4.discriminatedUnion('action', [
        z4.object({ action: z4.literal('lookup'), id: z4.string() }),
        z4.object({ action: z4.literal('search'), query: z4.string() }),
      ]),
    },
  ])(
    'rejects a root discriminated union from $name and accepts it nested',
    async ({ request }) => {
      await expect(
        validateToolSchemas({
          tools: { lookup: tool({ inputSchema: request }) },
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);
      await expect(
        validateToolSchemas({
          tools: {
            lookup: tool({
              inputSchema: jsonSchema({
                type: 'object',
                properties: { request: await zodSchema(request).jsonSchema },
              }),
            }),
          },
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.each(['anyOf', 'oneOf', 'allOf'] as const)(
    'preserves nested %s and does not execute tools',
    async keyword => {
      const inputSchema = {
        type: 'object',
        properties: { request: { [keyword]: [{ type: 'object' }] } },
      } satisfies JSONSchema7;
      const originalSchema = structuredClone(inputSchema);
      const execute = vi.fn();

      await validateToolSchemas({
        tools: {
          lookup: tool({ inputSchema: jsonSchema(inputSchema), execute }),
        },
      });

      expect(inputSchema).toEqual(originalSchema);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, false, true])(
    'checks roots independently of strict: %s',
    async strict => {
      await expect(
        validateToolSchemas({
          tools: { lookup: tool({ inputSchema: z4.string(), strict }) },
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);
    },
  );

  it('accepts empty tool sets and object schemas without properties', async () => {
    await validateToolSchemas({ tools: {} });
    await validateToolSchemas({
      tools: { noop: tool({ inputSchema: jsonSchema({ type: 'object' }) }) },
    });
  });

  it('resolves lazy and asynchronous schemas', async () => {
    await validateToolSchemas({
      tools: {
        lazy: tool({ inputSchema: lazySchema(() => zodSchema(z4.object({}))) }),
        async: tool({
          inputSchema: jsonSchema(Promise.resolve({ type: 'object' })),
        }),
      },
    });
    await expect(
      validateToolSchemas({
        tools: {
          lookup: tool({
            inputSchema: lazySchema(() =>
              jsonSchema(async () => ({ type: 'string' })),
            ),
          }),
        },
      }),
    ).rejects.toThrow("Tool 'lookup'");
  });

  it('converts Standard Schema without invoking its value validator', async () => {
    const validate = vi.fn();
    const input = vi.fn().mockReturnValue({ type: 'object' });
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate,
        jsonSchema: { input, output: input },
      },
    };

    await validateToolSchemas({
      tools: { lookup: tool({ inputSchema: schema }) },
    });

    expect(input).toHaveBeenCalledWith({ target: 'draft-07' });
    expect(validate).not.toHaveBeenCalled();
  });

  it('checks dynamic tools but skips provider-defined tools', async () => {
    await validateToolSchemas({
      tools: { search: anthropic.tools.webSearch_20250305({}) },
    });
    await expect(
      validateToolSchemas({
        tools: {
          search: anthropic.tools.webSearch_20250305({}),
          lookup: dynamicTool({ inputSchema: jsonSchema({}) }),
        },
      }),
    ).rejects.toThrow("Tool 'lookup'");
  });

  it('propagates errors when a schema cannot be resolved', async () => {
    const error = new Error('Schema unavailable');
    await expect(
      validateToolSchemas({
        tools: {
          lookup: tool({
            inputSchema: lazySchema(() => {
              throw error;
            }),
          }),
        },
      }),
    ).rejects.toBe(error);
  });
});
