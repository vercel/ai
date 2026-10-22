import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import { deepseekSearch } from './deepseek-search';

describe('deepseekSearch', () => {
  it('registers a provider-executed tool with camelCase developer configuration', () => {
    const config = {
      count: 5,
      needContent: true,
      oriQuestion: 'Question',
      localization: '8.8.8.8',
    };
    expect(gatewayTools.deepseekSearch(config)).toMatchObject({
      type: 'provider',
      id: 'gateway.deepseek_search',
      args: config,
      isProviderExecuted: true,
    });
  });

  it('exposes wire input names but keeps localization developer-only', async () => {
    const schema = await asSchema(deepseekSearch().inputSchema).jsonSchema;
    expect(schema).toMatchObject({
      required: ['query'],
      properties: {
        query: { type: 'string' },
        count: { minimum: 1, maximum: 50 },
        need_content: { type: 'boolean' },
      },
    });
    expect(schema.properties).not.toHaveProperty('localization');
  });

  it.each(['', ' ', 'x'.repeat(129), '😀'.repeat(129)])(
    'rejects invalid query %j',
    async query => {
      expect(
        (
          await safeValidateTypes({
            value: { query },
            schema: asSchema(deepseekSearch().inputSchema),
          })
        ).success,
      ).toBe(false);
    },
  );

  it('accepts 128 Unicode code points', async () => {
    expect(
      (
        await safeValidateTypes({
          value: { query: '😀'.repeat(128), ori_question: null },
          schema: asSchema(deepseekSearch().inputSchema),
        })
      ).success,
    ).toBe(true);
  });

  it('accepts nullable result metadata and preserves additive response fields', async () => {
    const value = {
      results: [
        {
          authority: -1,
          content: '',
          date: null,
          rerank_score: 2.4,
          site_icon: null,
          site_name: null,
          snippet: 'Snippet',
          summary: 'Summary',
          title: 'Title',
          url: 'https://example.com',
          extra: true,
        },
      ],
    };
    const result = await safeValidateTypes({
      value,
      schema: asSchema(deepseekSearch().outputSchema),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it.each([
    { results: [] },
    {
      error: 'gateway_rate_limit',
      message: 'Retry later',
      statusCode: 429,
      retryAfter: '2',
    },
  ])('accepts result %j', async value => {
    expect(
      (
        await safeValidateTypes({
          value,
          schema: asSchema(deepseekSearch().outputSchema),
        })
      ).success,
    ).toBe(true);
  });

  it('rejects malformed result bodies', async () => {
    expect(
      (
        await safeValidateTypes({
          value: { results: [{}] },
          schema: asSchema(deepseekSearch().outputSchema),
        })
      ).success,
    ).toBe(false);
  });
});
