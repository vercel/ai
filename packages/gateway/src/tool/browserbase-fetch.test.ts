import { asSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { browserbaseFetch } from './browserbase-fetch';

describe('browserbaseFetch', () => {
  it('creates a provider-executed Browserbase Fetch tool', () => {
    expect(
      browserbaseFetch({
        allowRedirects: true,
        format: 'markdown',
        proxies: true,
      }),
    ).toMatchObject({
      type: 'provider',
      id: 'gateway.browserbase_fetch',
      args: {
        allowRedirects: true,
        format: 'markdown',
        proxies: true,
      },
      isProviderExecuted: true,
    });
  });

  it('describes all Browserbase Fetch API inputs', async () => {
    const inputSchema = await asSchema(browserbaseFetch().inputSchema)
      .jsonSchema;

    expect(inputSchema).toMatchObject({
      required: ['url'],
      properties: {
        url: { type: 'string' },
        allow_redirects: { type: 'boolean' },
        allow_insecure_ssl: { type: 'boolean' },
        proxies: { type: 'boolean' },
        format: { enum: ['raw', 'json', 'markdown'] },
        schema: { type: 'object' },
      },
    });
  });
});
