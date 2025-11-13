import { InferSchema, Tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it, expect } from 'vitest';
import { search, PerplexitySearchResponse } from './search';

describe('Perplexity Search Tool', () => {
  describe('Type Safety', () => {
    it('should have correct Tool type', () => {
      const searchTool = search({ apiKey: 'test-key' });

      expectTypeOf(searchTool).toEqualTypeOf<
        Tool<
          { query: string | string[] },
          PerplexitySearchResponse
        >
      >();
    });

    it('should accept single query string', () => {
      const searchTool = search({ apiKey: 'test-key' });
      
      expectTypeOf(searchTool.inputSchema).toMatchTypeOf<any>();
    });

    it('should accept query array for multi-query', () => {
      const searchTool = search({ apiKey: 'test-key' });
      
      expectTypeOf(searchTool.inputSchema).toMatchTypeOf<any>();
    });
  });

  describe('Configuration', () => {
    it('should create tool with API key from config', () => {
      const searchTool = search({ apiKey: 'test-key' });
      
      expect(searchTool.description).toContain('Perplexity Search API');
      expect(searchTool.execute).toBeDefined();
    });

    it('should create tool with API key from environment', () => {
      const originalKey = process.env.PERPLEXITY_API_KEY;
      process.env.PERPLEXITY_API_KEY = 'env-key';

      const searchTool = search();
      
      expect(searchTool.execute).toBeDefined();

      process.env.PERPLEXITY_API_KEY = originalKey;
    });

    it('should throw error when API key is missing', async () => {
      const originalKey = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const searchTool = search();

      await expect(
        searchTool.execute!({ query: 'test' }, { toolCallId: 'test', messages: [] }),
      ).rejects.toThrow('Please provide an API key');

      process.env.PERPLEXITY_API_KEY = originalKey;
    });
  });

  describe('Search Options', () => {
    it('should accept all filter options', () => {
      const searchTool = search({
        apiKey: 'test-key',
        max_results: 5,
        max_tokens_per_page: 2000,
        country: 'US',
        search_domain_filter: ['example.com'],
        search_language_filter: ['en'],
        search_after_date: '1/1/2025',
        search_before_date: '12/31/2025',
        search_recency_filter: 'week',
      });

      expect(searchTool.description).toContain('search results');
      expect(searchTool.description).toContain('metadata');
    });
  });
});