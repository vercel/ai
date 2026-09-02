import { asSchema } from '@ai-sdk/provider-utils';
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
});
