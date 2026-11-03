import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { parallelSearch } from './parallel-search';

const modes = [
  'turbo',
  'fast',
  'basic',
  'advanced',
  'one-shot',
  'agentic',
] as const;

describe('parallelSearch', () => {
  it('creates a provider-executed Parallel Search tool', () => {
    expect(
      parallelSearch({
        mode: 'fast',
        location: 'us',
        maxCharsTotal: 8000,
        fetchPolicy: { timeoutSeconds: 10, disableCacheFallback: true },
      }),
    ).toMatchObject({
      type: 'provider',
      id: 'gateway.parallel_search',
      args: {
        mode: 'fast',
        location: 'us',
        maxCharsTotal: 8000,
        fetchPolicy: { timeoutSeconds: 10, disableCacheFallback: true },
      },
      isProviderExecuted: true,
    });
  });

  describe('input schema', () => {
    it.each(modes)('accepts mode %s', async mode => {
      const result = await safeValidateTypes({
        value: { objective: 'Find the latest TypeScript release', mode },
        schema: asSchema(parallelSearch().inputSchema),
      });

      expect(result.success).toBe(true);
    });

    it('rejects an unknown mode', async () => {
      const result = await safeValidateTypes({
        value: {
          objective: 'Find the latest TypeScript release',
          mode: 'deep',
        },
        schema: asSchema(parallelSearch().inputSchema),
      });

      expect(result.success).toBe(false);
    });

    it('keeps the GA input fields', async () => {
      const input = {
        objective: 'Find the Python 3 asyncio docs',
        search_queries: ['python asyncio docs'],
        location: 'us',
        max_chars_total: 6000,
        fetch_policy: {
          max_age_seconds: 600,
          timeout_seconds: 10,
          disable_cache_fallback: true,
        },
        source_policy: { include_domains: ['docs.python.org/3'] },
      };

      const result = await safeValidateTypes({
        value: input,
        schema: asSchema(parallelSearch().inputSchema),
      });

      expect(result.success).toBe(true);
      expect(result.success && result.value).toEqual(input);
    });

    it('describes modes and domain/path prefixes in the JSON schema', async () => {
      const inputSchema = await asSchema(parallelSearch().inputSchema)
        .jsonSchema;

      expect(inputSchema).toMatchObject({
        required: ['objective'],
        properties: {
          mode: { enum: [...modes] },
          source_policy: {
            properties: {
              include_domains: {
                description: expect.stringContaining('domain/path'),
              },
            },
          },
        },
      });
    });
  });

  describe('output schema', () => {
    it('validates a Beta response', async () => {
      const result = await safeValidateTypes({
        value: {
          search_id: 'search_beta_1',
          results: [
            {
              url: 'https://example.com/docs',
              title: 'Example Docs',
              excerpts: ['# Example Docs\nGetting started.'],
            },
          ],
          usage: [{ name: 'sku_search', count: 1 }],
        },
        schema: asSchema(parallelSearch().outputSchema),
      });

      expect(result.success).toBe(true);
    });

    it('validates a GA response with null fields', async () => {
      const result = await safeValidateTypes({
        value: {
          search_id: 'search_ga_1',
          results: [
            {
              url: 'https://example.com/docs',
              title: null,
              publish_date: null,
              excerpts: ['First excerpt', 'Second excerpt'],
            },
            {
              url: 'https://example.com/blog',
              title: 'Example Blog',
              publish_date: '2026-01-15',
              excerpts: [],
            },
          ],
          warnings: null,
          usage: [{ name: 'sku_search', count: 1 }],
          session_id: 'session_ga_1',
          metadata: null,
        },
        schema: asSchema(parallelSearch().outputSchema),
      });

      expect(result.success).toBe(true);
    });

    it('validates a GA response with warnings', async () => {
      const result = await safeValidateTypes({
        value: {
          search_id: 'search_ga_2',
          results: [],
          warnings: [
            {
              type: 'input_validation_warning',
              message: 'Invalid location was ignored.',
              detail: { field: 'location' },
            },
          ],
          session_id: 'session_ga_2',
        },
        schema: asSchema(parallelSearch().outputSchema),
      });

      expect(result.success).toBe(true);
    });

    it.each([
      { error: 'execution_error', message: 'Search failed' },
      { error: 'timeout', message: 'Search timed out', statusCode: 504 },
      { error: 'gateway_rate_limit', message: 'Too many requests' },
    ])('validates a gateway error ($error)', async value => {
      const result = await safeValidateTypes({
        value,
        schema: asSchema(parallelSearch().outputSchema),
      });

      expect(result.success).toBe(true);
    });

    it('rejects a response without search_id', async () => {
      const result = await safeValidateTypes({
        value: {
          results: [{ url: 'https://example.com', excerpts: ['Excerpt'] }],
        },
        schema: asSchema(parallelSearch().outputSchema),
      });

      expect(result.success).toBe(false);
    });

    it('rejects the previously declared camelCase shape', async () => {
      const result = await safeValidateTypes({
        value: {
          searchId: 'search_old_1',
          results: [
            {
              url: 'https://example.com',
              title: 'Example',
              excerpt: 'Excerpt',
            },
          ],
        },
        schema: asSchema(parallelSearch().outputSchema),
      });

      expect(result.success).toBe(false);
    });

    it('does not declare fields the gateway never returns', async () => {
      const outputSchema = await asSchema(parallelSearch().outputSchema)
        .jsonSchema;
      const serializedSchema = JSON.stringify(outputSchema);

      expect(serializedSchema).not.toContain('relevanceScore');
      expect(serializedSchema).not.toContain('searchId');
      expect(serializedSchema).not.toContain('publishDate');
      expect(serializedSchema).not.toContain('"excerpt"');
    });
  });
});
