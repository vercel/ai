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
  it('compiles an unchanged JSON Schema once across calls', async () => {
    const { default: Ajv } = await import('ajv');
    const compileSpy = vi.spyOn(Ajv.prototype, 'compile');

    try {
      const original = {
        search: tool({
          description: 'Search documentation',
          inputSchema: jsonSchema({
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          }),
        }),
      };

      compileSpy.mockClear();
      resolveSerializableTools(serializeToolSet(original));
      const afterFirst = compileSpy.mock.calls.length;
      resolveSerializableTools(serializeToolSet(original));
      const afterSecond = compileSpy.mock.calls.length;

      expect(afterFirst).toBe(1);
      expect(afterSecond).toBe(1);
    } finally {
      compileSpy.mockRestore();
    }
  });

  it('compiles a changed JSON Schema again', async () => {
    const { default: Ajv } = await import('ajv');
    const compileSpy = vi.spyOn(Ajv.prototype, 'compile');

    try {
      // The cache key is the schema's JSON text, so this schema must differ
      // from every other one in this file; the tool name plays no part.
      const build = (type: 'string' | 'number') => ({
        lookup: tool({
          description: 'Look up a record',
          inputSchema: jsonSchema({
            type: 'object',
            properties: { key: { type } },
            required: ['key'],
          }),
        }),
      });

      compileSpy.mockClear();
      resolveSerializableTools(serializeToolSet(build('string')));
      const afterFirst = compileSpy.mock.calls.length;
      resolveSerializableTools(serializeToolSet(build('number')));
      const afterChange = compileSpy.mock.calls.length;

      expect(afterFirst).toBe(1);
      expect(afterChange).toBe(2);
    } finally {
      compileSpy.mockRestore();
    }
  });

  it('resolves a $ref from one tool schema to another in the same set', () => {
    const tools = {
      shared: tool({
        description: 'Shared shape',
        inputSchema: jsonSchema({
          $id: 'https://example.com/serializable-schema-shared',
          type: 'object',
          properties: { a: { type: 'string' } },
        }),
      }),
      consumer: tool({
        description: 'Refers to the shared shape',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            s: { $ref: 'https://example.com/serializable-schema-shared' },
          },
        }),
      }),
    };

    // Tools in one set share a compiler, so the second schema resolves.
    expect(() =>
      resolveSerializableTools(serializeToolSet(tools)),
    ).not.toThrow();
  });

  it('recompiles a schema whose fixed $id stayed the same but whose body changed', () => {
    const build = (type: 'string' | 'number') => ({
      probe: tool({
        description: 'Probe a value',
        inputSchema: jsonSchema({
          $id: 'https://example.com/serializable-schema-probe',
          type: 'object',
          properties: { v: { type } },
        }),
      }),
    });

    // Ajv refuses a second schema with an $id it already holds, so a shared
    // compiler would throw here instead of recompiling.
    expect(() =>
      resolveSerializableTools(serializeToolSet(build('string'))),
    ).not.toThrow();
    expect(() =>
      resolveSerializableTools(serializeToolSet(build('number'))),
    ).not.toThrow();
  });

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
