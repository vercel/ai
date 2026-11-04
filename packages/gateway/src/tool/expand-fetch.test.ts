import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { expandFetch } from './expand-fetch';

const meta = {
  version: 1,
  url: 'https://www.nps.gov/yose/planyourvisit/halfdome.htm',
  title: 'Half Dome Day Hike - Yosemite National Park',
  lang: 'en',
  pageType: 'article',
  contentType: 'text/html',
  capturedAt: '2026-10-14T12:00:00.000Z',
  playground: 'https://expand.ai/s/snp_1a2b3c4d5e6f',
  citationEvidenceIds: [12, 48],
};

describe('expandFetch', () => {
  it('creates a provider-executed Expand Fetch tool', () => {
    expect(expandFetch()).toMatchObject({
      type: 'provider',
      id: 'gateway.expand_fetch',
      args: {},
      isProviderExecuted: true,
    });
  });

  it('passes every configuration option through as args', () => {
    const config = {
      includeMeta: true,
      includeJson: false,
      includeAppendix: true,
      appendixMarkers: 'off' as const,
      scrollFullPage: true,
      highlights: { maxResults: 3, minScore: 0.5 },
    };

    expect(expandFetch(config)).toMatchObject({
      id: 'gateway.expand_fetch',
      args: config,
    });
  });

  it('describes all Expand Fetch inputs', async () => {
    const inputSchema = await asSchema(expandFetch().inputSchema).jsonSchema;

    expect(inputSchema).toMatchObject({
      required: ['url'],
      properties: {
        url: { type: 'string' },
        highlights: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            max_results: { type: 'integer' },
            min_score: { type: 'number' },
          },
        },
        include_meta: { type: 'boolean' },
        include_appendix: { type: 'boolean' },
        include_json: { type: 'boolean' },
      },
    });
  });

  it('validates an Expand Fetch success response', async () => {
    const result = await safeValidateTypes({
      value: {
        meta,
        markdown: '# Half Dome Day Hike\n\nPermits are required ...',
        json: [],
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates a Highlights success response', async () => {
    const result = await safeValidateTypes({
      value: {
        meta: {
          ...meta,
          markdown: { url: 'https://expand.ai/s/snp_1a2b3c4d5e6f/content' },
        },
        markdown: '',
        json: [],
        data: {
          highlights: {
            query: 'permit requirements',
            snippets: [
              {
                source: 'markdown',
                text: 'Permits are required to hike to the top of Half Dome when the cables are up.',
                score: 0.91,
                location: { evidenceId: 12 },
              },
            ],
          },
        },
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates a captured error page with originError', async () => {
    const result = await safeValidateTypes({
      value: {
        meta,
        markdown: '# Page not found',
        json: [],
        originError: {
          _tag: 'FetchOriginError',
          url: 'https://example.com/missing',
          kind: 'http',
          originStatusCode: 404,
          retryable: false,
        },
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('rejects a success response missing the Snapshot link', async () => {
    const { playground: _playground, ...metaWithoutPlayground } = meta;

    const result = await safeValidateTypes({
      value: {
        meta: metaWithoutPlayground,
        markdown: '# Half Dome Day Hike',
        json: [],
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(false);
  });

  it('validates an HTTP origin error response', async () => {
    const result = await safeValidateTypes({
      value: {
        _tag: 'FetchOriginError',
        url: 'https://example.com/missing',
        kind: 'http',
        originStatusCode: 404,
        retryable: false,
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates a network origin error response', async () => {
    const result = await safeValidateTypes({
      value: {
        _tag: 'FetchOriginError',
        url: 'https://example.invalid',
        kind: 'dns',
        upstreamError: 'net::ERR_NAME_NOT_RESOLVED',
        retryable: true,
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates an Expand Fetch error response', async () => {
    const result = await safeValidateTypes({
      value: {
        error: 'rate_limit',
        statusCode: 429,
        message: 'Too many concurrent fetches.',
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown error code', async () => {
    const result = await safeValidateTypes({
      value: {
        error: 'not_a_real_error',
        message: 'nope',
      },
      schema: asSchema(expandFetch().outputSchema),
    });

    expect(result.success).toBe(false);
  });
});
