import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { asSchema, lazySchema, zodSchema } from './schema';
import {
  createServerToolFactory,
  mapServerToolConfig,
  resolveServerToolModelSchema,
  type ServerToolV1,
} from './server-tool-v1';

type TestInput = {
  query: string;
  num_results?: number;
  internal_flag?: boolean;
  contents?: { max_age_hours?: number };
};

const inputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z.string().describe('validation-facing query description'),
      num_results: z.number().int().min(1).max(100).optional(),
      internal_flag: z.boolean().optional(),
      contents: z
        .object({ max_age_hours: z.number().int().optional() })
        .optional(),
    }),
  ),
);

const outputSchema = lazySchema(() =>
  zodSchema(z.object({ results: z.array(z.string()) })),
);

function createTestTool(
  overrides: Partial<ServerToolV1<TestInput, { results: string[] }>> = {},
): ServerToolV1<TestInput, { results: string[] }> {
  return {
    specificationVersion: 'server-tool-v1',
    id: 'test.search',
    vendor: 'test-vendor',
    contractVersion: 1,
    origins: ['https://api.test-vendor.example'],
    inputSchema,
    outputSchema,
    modelFacing: { description: 'Search the test vendor.' },
    adapter: {
      buildRequest: input => ({
        url: 'https://api.test-vendor.example/search',
        method: 'POST',
        body: { q: input.query },
        auth: { kind: 'header', name: 'x-api-key' },
      }),
      parseResponse: response =>
        response.status === 200
          ? { ok: true, output: response.body as { results: string[] } }
          : { ok: false, error: 'api_error', message: response.statusText },
    },
    ...overrides,
  };
}

describe('createServerToolFactory', () => {
  it('produces a provider-executed tool with the spec id and schemas', () => {
    const serverTool = createTestTool();
    const factory = createServerToolFactory<
      TestInput,
      { results: string[] },
      { numResults?: number }
    >(serverTool);

    const tool = factory({ numResults: 5 });

    expect(tool.type).toBe('provider');
    expect(tool.id).toBe('test.search');
    expect(tool.args).toStrictEqual({ numResults: 5 });
    expect(tool.inputSchema).toBe(serverTool.inputSchema);
    expect(tool.outputSchema).toBe(serverTool.outputSchema);
  });

  it('does not leak execution onto the declared tool', () => {
    const tool = createServerToolFactory<TestInput, unknown, {}>(
      createTestTool(),
    )({});

    // Clients declare the tool; the gateway executes it. An `execute` here
    // would make the SDK attempt the upstream call itself.
    expect(tool).not.toHaveProperty('execute');
    expect(tool.isProviderExecuted).toBe(true);
  });
});

describe('mapServerToolConfig', () => {
  it('converts camelCase config keys to snake_case by default', () => {
    expect(
      mapServerToolConfig(createTestTool(), {
        numResults: 5,
        startPublishedDate: '2026-01-01',
      }),
    ).toStrictEqual({ num_results: 5, start_published_date: '2026-01-01' });
  });

  it('converts nested object keys at any depth', () => {
    expect(
      mapServerToolConfig(createTestTool(), {
        contents: {
          maxAgeHours: 24,
          extras: { imageLinks: 3 },
        },
      }),
    ).toStrictEqual({
      contents: { max_age_hours: 24, extras: { image_links: 3 } },
    });
  });

  it('converts keys inside object arrays but leaves primitive arrays alone', () => {
    expect(
      mapServerToolConfig(createTestTool(), {
        includeDomains: ['reuters.com', 'bbc.com'],
        filters: [{ maxRows: 10 }],
      }),
    ).toStrictEqual({
      include_domains: ['reuters.com', 'bbc.com'],
      filters: [{ max_rows: 10 }],
    });
  });

  it('leaves keys untouched when configKeyCase is preserve', () => {
    expect(
      mapServerToolConfig(createTestTool({ configKeyCase: 'preserve' }), {
        numResults: 5,
      }),
    ).toStrictEqual({ numResults: 5 });
  });

  it('returns an empty object for missing config', () => {
    expect(mapServerToolConfig(createTestTool(), undefined)).toStrictEqual({});
    expect(mapServerToolConfig(createTestTool(), null)).toStrictEqual({});
  });
});

describe('resolveServerToolModelSchema', () => {
  it('derives the model-facing schema from inputSchema', async () => {
    const { description, inputSchema: derived } =
      await resolveServerToolModelSchema(createTestTool());

    expect(description).toBe('Search the test vendor.');
    expect(derived).toMatchObject({
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        num_results: { type: 'integer', minimum: 1, maximum: 100 },
      },
    });
  });

  it('overlays model-facing descriptions and vendor defaults', async () => {
    const { inputSchema: derived } = await resolveServerToolModelSchema(
      createTestTool({
        modelFacing: {
          description: 'Search the test vendor.',
          annotations: {
            query: { description: 'Natural-language query. REQUIRED.' },
            num_results: { default: 10 },
            'contents.max_age_hours': {
              description: 'Cache freshness in hours.',
            },
          },
        },
      }),
    );

    expect(derived.properties).toMatchObject({
      query: { description: 'Natural-language query. REQUIRED.' },
      num_results: { default: 10 },
      contents: {
        properties: {
          max_age_hours: { description: 'Cache freshness in hours.' },
        },
      },
    });
  });

  it('removes hidden fields and drops them from required', async () => {
    const { inputSchema: derived } = await resolveServerToolModelSchema(
      createTestTool({
        modelFacing: {
          description: 'Search the test vendor.',
          hiddenFields: ['internal_flag', 'query'],
        },
      }),
    );

    expect(derived.properties).not.toHaveProperty('internal_flag');
    expect(derived.properties).not.toHaveProperty('query');
    expect(derived.required).not.toContain('query');
  });

  it('ignores annotations and hidden fields that do not resolve', async () => {
    const { inputSchema: derived } = await resolveServerToolModelSchema(
      createTestTool({
        modelFacing: {
          description: 'Search the test vendor.',
          annotations: {
            renamed_field: { description: 'gone' },
            'contents.renamed.deeper': { description: 'gone' },
          },
          hiddenFields: ['also_gone'],
        },
      }),
    );

    expect(derived.properties).not.toHaveProperty('renamed_field');
    expect(derived.properties).toHaveProperty('query');
  });

  it('does not mutate the tool definition across calls', async () => {
    const serverTool = createTestTool({
      modelFacing: {
        description: 'Search the test vendor.',
        hiddenFields: ['internal_flag'],
      },
    });

    await resolveServerToolModelSchema(serverTool);
    const second = await resolveServerToolModelSchema(serverTool);

    // `lazySchema` caches, so the first call's field removal must happen on a
    // copy — otherwise it would corrupt the schema used for validation.
    expect(second.inputSchema.properties).not.toHaveProperty('internal_flag');
    const validationSchema = await asSchema(serverTool.inputSchema).jsonSchema;
    expect(validationSchema.properties).toHaveProperty('internal_flag');
  });
});
