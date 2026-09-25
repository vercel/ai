import { describe, it, expect } from 'vitest';
import { dynamicTool, tool } from 'ai';
import { jsonSchema } from '@ai-sdk/provider-utils';
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
    expect(resolved.dynamicSearch.type).toBe('dynamic');
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
