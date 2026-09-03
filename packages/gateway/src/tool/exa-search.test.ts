import {
  asSchema,
  resolveServerToolModelSchema,
  type ServerToolResponse,
} from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  exaSearch,
  exaSearchServerTool,
  type ExaSearchInput,
} from './exa-search';

function response(overrides: Partial<ServerToolResponse>): ServerToolResponse {
  return {
    status: 200,
    statusText: 'OK',
    body: { requestId: 'req_1', results: [] },
    header: () => undefined,
    ...overrides,
  };
}

describe('exaSearch declaration', () => {
  it('declares a provider-executed tool with the gateway id', () => {
    const tool = exaSearch({ numResults: 5, category: 'news' });

    expect(tool.type).toBe('provider');
    expect(tool.id).toBe('gateway.exa_search');
    expect(tool.isProviderExecuted).toBe(true);
    // Developer config travels as camelCase `args`; the host converts it.
    expect(tool.args).toStrictEqual({ numResults: 5, category: 'news' });
  });
});

describe('exaSearchServerTool.modelFacing', () => {
  it('derives a model-facing schema carrying the curated descriptions', async () => {
    const { description, inputSchema } =
      await resolveServerToolModelSchema(exaSearchServerTool);

    expect(description).toContain('You MUST provide a query parameter');
    expect(inputSchema).toMatchObject({
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: expect.stringContaining('REQUIRED'),
        },
        num_results: { default: 10 },
        contents: {
          properties: {
            max_age_hours: {
              description: expect.stringContaining('never livecrawl'),
            },
          },
        },
      },
    });
  });

  it('cannot drift from the validation schema', async () => {
    // The whole point of deriving: every property the model is offered is a
    // property the validator accepts. Hand-authored JSON Schema could not
    // guarantee this.
    const { inputSchema: modelFacing } =
      await resolveServerToolModelSchema(exaSearchServerTool);
    const validation = await asSchema(exaSearchServerTool.inputSchema)
      .jsonSchema;

    expect(Object.keys(modelFacing.properties ?? {})).toStrictEqual(
      Object.keys(validation.properties ?? {}),
    );
    expect(modelFacing.required).toStrictEqual(validation.required);
  });
});

describe('exaSearchServerTool.adapter.buildRequest', () => {
  it('targets a declared origin', () => {
    const plan = exaSearchServerTool.adapter.buildRequest({ query: 'ai news' });

    expect(
      exaSearchServerTool.origins.some(origin => plan.url.startsWith(origin)),
    ).toBe(true);
    expect(plan.url).toBe('https://api.exa.ai/search');
    expect(plan.method).toBe('POST');
  });

  it('names the auth scheme without carrying a credential', () => {
    const plan = exaSearchServerTool.adapter.buildRequest({ query: 'ai news' });

    expect(plan.auth).toStrictEqual({ kind: 'header', name: 'x-api-key' });
    expect(JSON.stringify(plan)).not.toContain('api_key');
  });

  it('defaults search type and requests highlights for token efficiency', () => {
    const plan = exaSearchServerTool.adapter.buildRequest({ query: 'ai news' });

    expect(plan.body).toStrictEqual({
      query: 'ai news',
      type: 'auto',
      contents: { highlights: true },
    });
  });

  it('converts snake_case input to Exa camelCase at every depth', () => {
    const input: ExaSearchInput = {
      query: 'ai news',
      type: 'fast',
      num_results: 5,
      user_location: 'US',
      include_domains: ['reuters.com'],
      start_published_date: '2026-01-01',
      contents: {
        text: { max_characters: 500, include_html_tags: false },
        highlights: { max_characters: 200 },
        max_age_hours: 24,
        livecrawl_timeout: 1000,
        subpage_target: ['pricing'],
        extras: { image_links: 3 },
      },
    };

    expect(exaSearchServerTool.adapter.buildRequest(input).body).toStrictEqual({
      query: 'ai news',
      type: 'fast',
      numResults: 5,
      userLocation: 'US',
      includeDomains: ['reuters.com'],
      startPublishedDate: '2026-01-01',
      contents: {
        text: { maxCharacters: 500, includeHtmlTags: false },
        highlights: { maxCharacters: 200 },
        maxAgeHours: 24,
        livecrawlTimeout: 1000,
        subpageTarget: ['pricing'],
        extras: { imageLinks: 3 },
      },
    });
  });

  it('preserves boolean content toggles', () => {
    const plan = exaSearchServerTool.adapter.buildRequest({
      query: 'ai news',
      contents: { text: true, highlights: false },
    });

    expect(plan.body).toMatchObject({
      contents: { text: true, highlights: false },
    });
  });
});

describe('exaSearchServerTool.adapter.parseResponse', () => {
  const input: ExaSearchInput = { query: 'ai news' };

  it('reports result counts and the requested count for billing', () => {
    const outcome = exaSearchServerTool.adapter.parseResponse(
      response({
        body: { requestId: 'req_1', results: [{ id: '1' }, { id: '2' }] },
      }),
      { query: 'ai news', num_results: 25 },
    );

    expect(outcome).toMatchObject({
      ok: true,
      usage: { resultCount: 2, requestedResults: 25 },
    });
  });

  it('bills the included count when the model asks for no count', () => {
    const outcome = exaSearchServerTool.adapter.parseResponse(
      response({}),
      input,
    );

    expect(outcome).toMatchObject({
      ok: true,
      usage: { requestedResults: 10 },
    });
  });

  it('classifies 429 as rate_limit and forwards retry-after', () => {
    const outcome = exaSearchServerTool.adapter.parseResponse(
      response({
        status: 429,
        statusText: 'Too Many Requests',
        body: { error: 'slow down' },
        header: name => (name === 'retry-after' ? '30' : undefined),
      }),
      input,
    );

    expect(outcome).toStrictEqual({
      ok: false,
      error: 'rate_limit',
      message: 'slow down',
      retryAfter: '30',
    });
  });

  it('classifies other failures as api_error', () => {
    const outcome = exaSearchServerTool.adapter.parseResponse(
      response({ status: 500, statusText: 'Server Error', body: {} }),
      input,
    );

    expect(outcome).toStrictEqual({
      ok: false,
      error: 'api_error',
      message: 'HTTP 500',
    });
  });

  it.each([
    [{ error: 'flat' }, 'flat'],
    [{ error: { message: 'nested' } }, 'nested'],
    [{ message: 'top level' }, 'top level'],
    ['plain text body', 'plain text body'],
    [{ unrelated: true }, 'HTTP 400'],
  ])('extracts an error message from %j', (body, expected) => {
    const outcome = exaSearchServerTool.adapter.parseResponse(
      response({ status: 400, statusText: 'Bad Request', body }),
      input,
    );

    expect(outcome).toMatchObject({ ok: false, message: expected });
  });

  it('truncates an oversized text body', () => {
    const outcome = exaSearchServerTool.adapter.parseResponse(
      response({
        status: 502,
        statusText: 'Bad Gateway',
        body: 'x'.repeat(500),
      }),
      input,
    );

    expect(outcome).toMatchObject({ ok: false, message: 'x'.repeat(200) });
  });
});
