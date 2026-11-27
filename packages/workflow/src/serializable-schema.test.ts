import type { JSONSchema7 } from '@ai-sdk/provider';
import { asSchema, jsonSchema } from '@ai-sdk/provider-utils';
import { dynamicTool, tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  serializeToolSet,
  resolveSerializableTools,
} from './serializable-schema';
import { createTestSandbox } from './test/test-sandbox';

describe('serializeToolSet', () => {
  it('serializes function tools with description and inputSchema', () => {
    const tools = {
      getWeather: tool({
        description: 'Get weather for a city',
        inputSchema: jsonSchema({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        }),
      }),
    };

    const serialized = serializeToolSet(tools);

    expect(serialized).toEqual({
      getWeather: {
        description: 'Get weather for a city',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    });
  });

  it('records when a tool input schema has its own validator', () => {
    const serialized = serializeToolSet({
      validated: tool({
        inputSchema: z.object({ value: z.coerce.number() }),
      }),
      jsonOnly: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: { value: { type: 'number' } },
        }),
      }),
    });

    expect(serialized.validated.hasOwnValidator).toBe(true);
    expect(serialized.jsonOnly.hasOwnValidator).toBeUndefined();
  });

  it('preserves provider tool type, id, and args', () => {
    // Provider tools (like anthropic.tools.webSearch) have type: 'provider',
    // an id, and args. These must survive serialization so the Gateway can
    // recognize them as provider-executed tools, not plain function tools.
    const tools = {
      webSearch: tool({
        type: 'provider' as const,
        id: 'anthropic.web_search_20250305' as const,
        isProviderExecuted: true,
        args: {
          maxUses: 5,
          allowedDomains: ['vercel.com', 'nextjs.org'],
        },
        inputSchema: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        }),
      }),
    };

    const serialized = serializeToolSet(tools);

    expect(serialized.webSearch).toMatchObject({
      type: 'provider',
      id: 'anthropic.web_search_20250305',
      args: {
        maxUses: 5,
        allowedDomains: ['vercel.com', 'nextjs.org'],
      },
    });
  });

  it('resolves descriptions from tool context and sandbox', () => {
    const sandbox = createTestSandbox({
      description: 'request sandbox',
    });
    const tools = {
      getWeather: tool({
        description: ({ context, experimental_sandbox }) =>
          `${context.city} via ${experimental_sandbox?.description}`,
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
        }),
        contextSchema: jsonSchema<{ city: string }>({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        }),
      }),
    };

    const serialized = serializeToolSet(tools, {
      toolsContext: {
        getWeather: { city: 'Berlin' },
      },
      experimental_sandbox: sandbox,
    });

    expect(serialized.getWeather.description).toBe(
      'Berlin via request sandbox',
    );
  });
});

describe('resolveSerializableTools', () => {
  it('round-trips function tool input examples and provider options', () => {
    const original = {
      search: tool({
        description: 'Search documentation',
        inputSchema: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        }),
        inputExamples: [{ input: { query: 'workflow durability' } }],
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      }),
    };

    const resolved = resolveSerializableTools(serializeToolSet(original));

    expect(resolved.search.inputExamples).toEqual(
      original.search.inputExamples,
    );
    expect(resolved.search.providerOptions).toEqual(
      original.search.providerOptions,
    );
  });

  it('round-trips current function and dynamic tool fields', () => {
    const original = {
      search: tool({
        title: 'Search title',
        metadata: { source: 'docs' },
        description: 'Search documentation',
        strict: true,
        inputSchema: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        }),
      }),
      dynamicSearch: dynamicTool({
        title: 'Dynamic search title',
        metadata: { source: 'mcp' },
        inputSchema: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        }),
      }),
    };

    const resolved = resolveSerializableTools(serializeToolSet(original));

    expect(resolved.search).toMatchObject({
      title: 'Search title',
      metadata: { source: 'docs' },
      strict: true,
    });
    expect(resolved.dynamicSearch).toMatchObject({
      type: 'dynamic',
      title: 'Dynamic search title',
      metadata: { source: 'mcp' },
    });
  });

  it('reconstructs function tools with Ajv validation', () => {
    const serialized = {
      getWeather: {
        description: 'Get weather for a city',
        inputSchema: {
          type: 'object' as const,
          properties: { city: { type: 'string' as const } },
          required: ['city'] as string[],
          additionalProperties: false,
        },
      },
    };

    const tools = resolveSerializableTools(serialized);

    expect(tools.getWeather).toBeDefined();
    expect(tools.getWeather.description).toBe('Get weather for a city');
  });

  it('defers validation to the original schema when it has its own validator', async () => {
    const tools = resolveSerializableTools(
      serializeToolSet({
        normalize: tool({
          inputSchema: z.object({ value: z.coerce.number() }),
        }),
      }),
    );

    expect(
      asSchema(tools.normalize.inputSchema).validate?.({
        value: '42',
        extra: true,
      }),
    ).toBeUndefined();
  });

  it('reports actionable details for every validation error', async () => {
    const tools = resolveSerializableTools({
      interaction: {
        inputSchema: {
          type: 'object',
          properties: {
            action: { enum: ['click', 'type', 'scroll'] },
          },
          required: ['action'],
        },
      },
      edit: {
        inputSchema: {
          type: 'object',
          properties: {
            edits: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  oldText: { type: 'string' },
                  newText: { type: 'string' },
                },
                required: ['oldText', 'newText'],
              },
            },
          },
          required: ['edits'],
        },
      },
    });

    const enumValidation = await asSchema(
      tools.interaction.inputSchema,
    ).validate?.({
      action: 'press',
    });
    const additionalPropertiesValidation = await asSchema(
      tools.edit.inputSchema,
    ).validate?.({
      edits: [
        { oldText: 'a', newText: 'b', path: 'a.ts' },
        { oldText: 'c', newText: 'd', path: 'b.ts' },
      ],
    });

    expect(enumValidation).toMatchObject({
      success: false,
      error: new Error('data/action must be one of "click", "type", "scroll"'),
    });
    expect(additionalPropertiesValidation).toMatchObject({
      success: false,
      error: new Error(
        'data/edits/0 has unexpected property "path", data/edits/1 has unexpected property "path"',
      ),
    });
  });

  it('accepts tool schemas with formats, annotations, unions, and JSON Schema 2020-12 without warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tools = resolveSerializableTools(
      serializeToolSet({
        formatted: tool({
          inputSchema: z.object({
            email: z.email(),
            url: z.url(),
            id: z.uuid(),
          }),
        }),
        annotated: tool({
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              value: {
                type: ['string', 'number'],
                example: 'example',
                'x-order': 1,
              },
            },
          } as JSONSchema7),
        }),
        modern: tool({
          inputSchema: jsonSchema({
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {
              creditCard: { type: 'number' },
              billingAddress: { type: 'string' },
            },
            dependentRequired: {
              creditCard: ['billingAddress'],
            },
          } as JSONSchema7),
        }),
      }),
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    const validation = await asSchema(tools.modern.inputSchema).validate?.({
      creditCard: 1234,
    });
    expect(validation).toMatchObject({ success: false });
  });

  it('reconstructs provider tools preserving type, id, and args', () => {
    const serialized = {
      webSearch: {
        type: 'provider' as const,
        id: 'anthropic.web_search_20250305' as const,
        args: {
          maxUses: 5,
          allowedDomains: ['vercel.com'],
        },
        inputSchema: {
          type: 'object' as const,
          properties: { query: { type: 'string' as const } },
          required: ['query'] as string[],
        },
      },
    };

    const tools = resolveSerializableTools(serialized);
    const webSearch = tools.webSearch;

    expect(webSearch).toBeDefined();
    expect(webSearch.type).toBe('provider');
    expect((webSearch as any).id).toBe('anthropic.web_search_20250305');
    expect((webSearch as any).args).toEqual({
      maxUses: 5,
      allowedDomains: ['vercel.com'],
    });
  });

  it('round-trips provider tool display metadata and deferred result support', () => {
    const original = {
      program: tool({
        type: 'provider',
        title: 'Program',
        metadata: { source: 'provider' },
        id: 'test.program',
        args: {},
        isProviderExecuted: true,
        supportsDeferredResults: true,
        inputSchema: jsonSchema({
          type: 'object',
          properties: { code: { type: 'string' } },
          required: ['code'],
        }),
        outputSchema: jsonSchema({
          type: 'object',
          properties: { status: { type: 'string' } },
          required: ['status'],
        }),
      }),
    };

    const resolved = resolveSerializableTools(serializeToolSet(original));

    expect(resolved.program).toMatchObject({
      title: 'Program',
      metadata: { source: 'provider' },
      supportsDeferredResults: true,
    });
  });
});

describe('serializeToolSet input schema reuse', () => {
  // A Standard Schema that counts its JSON Schema conversions. `asSchema`
  // wraps it in a new schema object on every call, like a Zod schema.
  function createCountedSchema(properties: JSONSchema7['properties'] = {}) {
    const convert = vi.fn(
      (): Record<string, unknown> => ({ type: 'object', properties }),
    );
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) => ({ value }),
        jsonSchema: { input: convert, output: convert },
      },
    };
    return { schema, convert };
  }

  it('converts an input schema to JSON Schema once across calls', () => {
    const { schema, convert } = createCountedSchema({
      city: { type: 'string' },
    });
    const tools = {
      getWeather: tool({ description: 'Get weather', inputSchema: schema }),
    };

    const first = serializeToolSet(tools);
    const second = serializeToolSet(tools);

    expect(convert).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.getWeather).toEqual({
      description: 'Get weather',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        additionalProperties: false,
      },
      hasOwnValidator: true,
    });
  });

  it('returns the same definitions as a first serialization for Zod schemas', () => {
    const createTools = () => ({
      search: tool({
        description: 'Search',
        inputSchema: z.object({
          query: z.string().describe('Search query'),
          limit: z.number().int().min(1).max(10).optional(),
        }),
      }),
    });
    const tools = createTools();

    serializeToolSet(tools);

    // Equal to the definitions of tools that were never serialized before.
    expect(serializeToolSet(tools)).toEqual(serializeToolSet(createTools()));
  });

  it('shares the JSON Schema between tool sets that use the same input schema', () => {
    const { schema, convert } = createCountedSchema();

    const all = serializeToolSet({
      first: tool({ description: 'First', inputSchema: schema }),
      second: tool({ description: 'Second', inputSchema: schema }),
    });
    const filtered = serializeToolSet({
      second: tool({ description: 'Second, changed', inputSchema: schema }),
    });

    expect(convert).toHaveBeenCalledTimes(1);
    expect(Object.keys(filtered)).toEqual(['second']);
    expect(filtered.second.description).toBe('Second, changed');
    expect(filtered.second.inputSchema).toEqual(all.first.inputSchema);
  });

  it('converts a replaced input schema', () => {
    const original = createCountedSchema({ city: { type: 'string' } });
    const replacement = createCountedSchema({ country: { type: 'string' } });
    const getWeather = tool({
      description: 'Get weather',
      inputSchema: original.schema,
    });

    serializeToolSet({ getWeather });
    const serialized = serializeToolSet({
      getWeather: { ...getWeather, inputSchema: replacement.schema },
    });

    expect(replacement.convert).toHaveBeenCalledTimes(1);
    expect(serialized.getWeather.inputSchema.properties).toEqual({
      country: { type: 'string' },
    });
  });

  it('reads all other tool fields again on every call', () => {
    const { schema } = createCountedSchema();
    const describeTool = vi.fn(
      ({ context }: { context: { city: string } }) =>
        `Weather in ${context.city}`,
    );
    const createTool = (strict?: boolean) =>
      tool({
        description: describeTool,
        inputSchema: schema,
        contextSchema: jsonSchema<{ city: string }>({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        }),
        strict,
      });

    const berlin = serializeToolSet(
      { getWeather: createTool() },
      { toolsContext: { getWeather: { city: 'Berlin' } } },
    );
    const paris = serializeToolSet(
      { getWeather: createTool(true) },
      { toolsContext: { getWeather: { city: 'Paris' } } },
    );

    expect(describeTool).toHaveBeenCalledTimes(2);
    expect(berlin.getWeather.description).toBe('Weather in Berlin');
    expect(berlin.getWeather.strict).toBeUndefined();
    expect(paris.getWeather.description).toBe('Weather in Paris');
    expect(paris.getWeather.strict).toBe(true);
  });

  it('does not keep a schema whose conversion fails', () => {
    const convert = vi
      .fn<() => Record<string, unknown>>()
      .mockImplementationOnce(() => {
        throw new Error('conversion failed');
      })
      .mockImplementation(() => ({ type: 'object', properties: {} }));
    const tools = {
      broken: tool({
        inputSchema: {
          '~standard': {
            version: 1 as const,
            vendor: 'test',
            validate: (value: unknown) => ({ value }),
            jsonSchema: { input: convert, output: convert },
          },
        },
      }),
    };

    expect(() => serializeToolSet(tools)).toThrow('conversion failed');
    expect(serializeToolSet(tools).broken.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('serializes tools without an input schema', () => {
    const tools = { noInput: { description: 'No input' } } as any;

    expect(serializeToolSet(tools)).toEqual(serializeToolSet(tools));
    expect(serializeToolSet(tools).noInput.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });
});
