import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod';

export interface PerplexitySearchConfig {
  /**
   * API key for authenticating requests to Perplexity Search API.
   * If not provided, will use PERPLEXITY_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Maximum number of search results to return (1-20).
   * @default 10
   */
  max_results?: number;

  /**
   * Maximum number of tokens to extract per search result page.
   * @default 1024
   */
  max_tokens_per_page?: number;

  /**
   * Two-letter ISO 3166-1 alpha-2 country code for regional search results.
   * Examples: "US", "GB", "FR"
   */
  country?: string;

  /**
   * List of domains to include or exclude from search results (max 20).
   * To include: ["nature.com", "science.org"]
   * To exclude: ["-example.com", "-spam.net"]
   */
  search_domain_filter?: string[];

  /**
   * List of ISO 639-1 language codes to filter results (max 10, lowercase).
   * Examples: ["en", "fr", "de"]
   */
  search_language_filter?: string[];

  /**
   * Include only results published after this date.
   * Format: "MM/DD/YYYY" (e.g., "3/1/2025")
   * Cannot be used with search_recency_filter.
   */
  search_after_date?: string;

  /**
   * Include only results published before this date.
   * Format: "MM/DD/YYYY" (e.g., "3/5/2025")
   * Cannot be used with search_recency_filter.
   */
  search_before_date?: string;

  /**
   * Filter results by relative time period.
   * Cannot be used with search_after_date or search_before_date.
   * Allowed values: "day" | "week" | "month" | "year"
   */
  search_recency_filter?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Individual search result from Perplexity Search API
 */
export interface PerplexitySearchResult {
  /**
   * Title of the search result
   */
  title: string;

  /**
   * URL of the search result
   */
  url: string;

  /**
   * Text snippet/preview of the content
   */
  snippet: string;

  /**
   * Publication date of the content
   */
  date?: string;

  /**
   * Last updated date of the content
   */
  last_updated?: string;
}

/**
 * Response from Perplexity Search API
 */
export interface PerplexitySearchResponse {
  /**
   * Array of search results
   */
  results: PerplexitySearchResult[];

  /**
   * Unique identifier for this search request
   */
  id: string;
}

export function search(config: PerplexitySearchConfig = {}) {
  const { apiKey = process.env.PERPLEXITY_API_KEY, ...searchOptions } = config;

  return tool({
    description:
      'Performs web search using the Perplexity Search API. Returns ranked search results with titles, URLs, snippets, and metadata.',
    inputSchema: z.object({
      query: z
        .union([z.string(), z.array(z.string())])
        .describe(
          'Search query (string) or multiple queries (array). Multi-query searches return combined results from all queries.',
        ),
    }),
    execute: async ({ query }): Promise<PerplexitySearchResponse> => {
      if (!apiKey) {
        throw new Error(
          'Please provide an API key for the Perplexity Search API.',
        );
      }

      const requestBody: Record<string, unknown> = {
        query,
      };

      if (searchOptions.max_results !== undefined) {
        requestBody.max_results = searchOptions.max_results;
      }
      if (searchOptions.max_tokens_per_page !== undefined) {
        requestBody.max_tokens_per_page = searchOptions.max_tokens_per_page;
      }
      if (searchOptions.country !== undefined) {
        requestBody.country = searchOptions.country;
      }
      if (
        searchOptions.search_domain_filter &&
        searchOptions.search_domain_filter.length > 0
      ) {
        requestBody.search_domain_filter = searchOptions.search_domain_filter;
      }
      if (
        searchOptions.search_language_filter &&
        searchOptions.search_language_filter.length > 0
      ) {
        requestBody.search_language_filter =
          searchOptions.search_language_filter;
      }
      if (searchOptions.search_after_date !== undefined) {
        requestBody.search_after_date = searchOptions.search_after_date;
      }
      if (searchOptions.search_before_date !== undefined) {
        requestBody.search_before_date = searchOptions.search_before_date;
      }
      if (searchOptions.search_recency_filter !== undefined) {
        requestBody.search_recency_filter = searchOptions.search_recency_filter;
      }

      try {
        const response = await fetch('https://api.perplexity.ai/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Perplexity Search API error: ${response.status} - ${errorText}`,
          );
        }

        const data: PerplexitySearchResponse = await response.json();
        return data;
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `Failed to search with Perplexity Search API: ${error.message}`,
          );
        }
        throw error;
      }
    },
  });
}
