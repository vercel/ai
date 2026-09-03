import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { browserbaseSearch } from './browserbase-search';

describe('browserbaseSearch', () => {
  it('creates a provider-executed Browserbase Search tool', () => {
    expect(browserbaseSearch({ numResults: 5 })).toMatchObject({
      type: 'provider',
      id: 'gateway.browserbase_search',
      args: { numResults: 5 },
      isProviderExecuted: true,
    });
  });

  it('describes the Browserbase Search API input constraints', async () => {
    const inputSchema = await asSchema(browserbaseSearch().inputSchema)
      .jsonSchema;

    expect(inputSchema).toMatchObject({
      required: ['query'],
      properties: {
        query: {
          minLength: 1,
          maxLength: 200,
        },
        num_results: {
          minimum: 1,
          maximum: 25,
        },
      },
    });
  });

  it('validates a Browserbase Search API success response', async () => {
    const result = await safeValidateTypes({
      value: {
        requestId: 'req_9f8e7d6c5b4a',
        query: 'half dome permit',
        results: [
          {
            id: 'result_1',
            url: 'https://www.nps.gov/yose/planyourvisit/halfdome.htm',
            title: 'Half Dome - Yosemite National Park',
            author: 'National Park Service',
            favicon: 'https://www.nps.gov/favicon.ico',
            image: 'https://www.nps.gov/halfdome.jpg',
            publishedDate: '2026-01-15T00:00:00Z',
          },
          {
            id: 'result_2',
            url: 'https://www.recreation.gov/permits/234652',
            title: 'Half Dome Permits',
          },
        ],
      },
      schema: asSchema(browserbaseSearch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates a Browserbase Search API error response', async () => {
    const result = await safeValidateTypes({
      value: {
        error: 'timeout',
        statusCode: 504,
        message: 'Search request timed out',
      },
      schema: asSchema(browserbaseSearch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('rejects a success response missing requestId', async () => {
    const result = await safeValidateTypes({
      value: {
        query: 'half dome permit',
        results: [],
      },
      schema: asSchema(browserbaseSearch().outputSchema),
    });

    expect(result.success).toBe(false);
  });
});
