import {
    createProviderDefinedToolFactoryWithOutputSchema,
    lazySchema,
    zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';

/**
 * Configuration options for the Perplexity Search tool.
 * These settings become defaults for all tool invocations.
 * Note: API key is not needed here - the gateway uses system credentials.
 */
export interface PerplexitySearchConfig {
    /**
     * Default maximum number of search results to return (1-20, default: 10).
     * The LLM can override this per-invocation.
     */
    maxResults?: number;

    /**
     * Default maximum tokens to extract per search result page (256-2048, default: 1024).
     * The LLM can override this per-invocation.
     */
    maxTokensPerPage?: number;

    /**
     * Default two-letter ISO 3166-1 alpha-2 country code for regional search results.
     * Examples: 'US', 'GB', 'FR'
     */
    country?: string;

    /**
     * Default list of domains to include or exclude from search results (max 20).
     * To include: ['nature.com', 'science.org']
     * To exclude: ['-example.com', '-spam.net']
     */
    searchDomainFilter?: string[];

    /**
     * Default list of ISO 639-1 language codes to filter results (max 10, lowercase).
     * Examples: ['en', 'fr', 'de']
     */
    searchLanguageFilter?: string[];

    /**
     * Default recency filter for results.
     * Cannot be combined with searchAfterDate/searchBeforeDate at runtime.
     */
    searchRecencyFilter?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Individual search result from Perplexity Search API.
 */
export interface PerplexitySearchResult {
    /** Title of the search result */
    title: string;
    /** URL of the search result */
    url: string;
    /** Text snippet/preview of the content */
    snippet: string;
    /** Publication date of the content */
    date?: string;
    /** Last updated date of the content */
    lastUpdated?: string;
}

/**
 * Response from Perplexity Search API.
 */
export interface PerplexitySearchResponse {
    /** Array of search results */
    results: PerplexitySearchResult[];
    /** Unique identifier for this search request */
    id: string;
}

/**
 * Error response when the search fails.
 */
export interface PerplexitySearchError {
    /** Error type */
    error: 'api_error' | 'rate_limit' | 'timeout' | 'invalid_input' | 'unknown';
    /** HTTP status code if applicable */
    statusCode?: number;
    /** Human-readable error message */
    message: string;
}

// Input schema matches the Perplexity Search API parameters
export const perplexitySearchInputSchema = lazySchema(() =>
    zodSchema(
        z.object({
            query: z
                .union([
                    z.string().min(1).max(500),
                    z.array(z.string().min(1).max(500)).max(5),
                ])
                .describe(
                    'Search query (string) or multiple queries (array of up to 5 strings). Multi-query searches return combined results from all queries.',
                ),

            max_results: z
                .number()
                .min(1)
                .max(20)
                .optional()
                .describe(
                    'Maximum number of search results to return (1-20, default: 10)',
                ),

            max_tokens_per_page: z
                .number()
                .min(256)
                .max(2048)
                .optional()
                .describe(
                    'Maximum number of tokens to extract per search result page (256-2048, default: 1024)',
                ),

            country: z
                .string()
                .length(2)
                .optional()
                .describe(
                    "Two-letter ISO 3166-1 alpha-2 country code for regional search results (e.g., 'US', 'GB', 'FR')",
                ),

            search_domain_filter: z
                .array(z.string())
                .max(20)
                .optional()
                .describe(
                    "List of domains to include or exclude from search results (max 20). To include: ['nature.com', 'science.org']. To exclude: ['-example.com', '-spam.net']",
                ),

            search_language_filter: z
                .array(z.string().length(2))
                .max(10)
                .optional()
                .describe(
                    "List of ISO 639-1 language codes to filter results (max 10, lowercase). Examples: ['en', 'fr', 'de']",
                ),

            search_after_date: z
                .string()
                .regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
                .optional()
                .describe(
                    "Include only results published after this date. Format: 'MM/DD/YYYY' (e.g., '3/1/2025'). Cannot be used with search_recency_filter.",
                ),

            search_before_date: z
                .string()
                .regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
                .optional()
                .describe(
                    "Include only results published before this date. Format: 'MM/DD/YYYY' (e.g., '3/15/2025'). Cannot be used with search_recency_filter.",
                ),

            search_recency_filter: z
                .enum(['day', 'week', 'month', 'year'])
                .optional()
                .describe(
                    'Filter results by relative time period. Cannot be used with search_after_date or search_before_date.',
                ),
        }),
    ),
);

// Output schema for the search results
export const perplexitySearchOutputSchema = lazySchema(() =>
    zodSchema(
        z.union([
            // Success response
            z.object({
                results: z.array(
                    z.object({
                        title: z.string(),
                        url: z.string(),
                        snippet: z.string(),
                        date: z.string().optional(),
                        lastUpdated: z.string().optional(),
                    }),
                ),
                id: z.string(),
            }),
            // Error response
            z.object({
                error: z.enum([
                    'api_error',
                    'rate_limit',
                    'timeout',
                    'invalid_input',
                    'unknown',
                ]),
                statusCode: z.number().optional(),
                message: z.string(),
            }),
        ]),
    ),
);

/**
 * Input type for perplexity search tool.
 */
export interface PerplexitySearchInput {
    /**
     * Search query (string) or multiple queries (array of up to 5 strings).
     * Multi-query searches return combined results from all queries.
     */
    query: string | string[];

    /**
     * Maximum number of search results to return (1-20, default: 10).
     */
    max_results?: number;

    /**
     * Maximum number of tokens to extract per search result page (256-2048, default: 1024).
     */
    max_tokens_per_page?: number;

    /**
     * Two-letter ISO 3166-1 alpha-2 country code for regional search results.
     * Examples: 'US', 'GB', 'FR'
     */
    country?: string;

    /**
     * List of domains to include or exclude from search results (max 20).
     * To include: ['nature.com', 'science.org']
     * To exclude: ['-example.com', '-spam.net']
     */
    search_domain_filter?: string[];

    /**
     * List of ISO 639-1 language codes to filter results (max 10, lowercase).
     * Examples: ['en', 'fr', 'de']
     */
    search_language_filter?: string[];

    /**
     * Include only results published after this date.
     * Format: 'MM/DD/YYYY' (e.g., '3/1/2025')
     * Cannot be used with search_recency_filter.
     */
    search_after_date?: string;

    /**
     * Include only results published before this date.
     * Format: 'MM/DD/YYYY' (e.g., '3/15/2025')
     * Cannot be used with search_recency_filter.
     */
    search_before_date?: string;

    /**
     * Filter results by relative time period.
     * Cannot be used with search_after_date or search_before_date.
     */
    search_recency_filter?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Output type for perplexity search tool - either success or error.
 */
export type PerplexitySearchOutput =
    | PerplexitySearchResponse
    | PerplexitySearchError;

/**
 * Factory function that creates the perplexity search tool.
 *
 * This is a provider-defined tool that is executed server-side by the AI Gateway.
 * The gateway handles authentication, rate limiting, billing, and observability.
 */
export const perplexitySearchToolFactory =
    createProviderDefinedToolFactoryWithOutputSchema<
        PerplexitySearchInput,
        PerplexitySearchOutput,
        PerplexitySearchConfig
    >({
        id: 'gateway.perplexity_search',
        name: 'perplexity_search',
        inputSchema: perplexitySearchInputSchema,
        outputSchema: perplexitySearchOutputSchema,
    });

/**
 * Creates a Perplexity Search tool for use with AI Gateway.
 *
 * This tool allows models to search the web using Perplexity's Search API
 * for real-time information, news, research papers, and articles.
 * It provides ranked search results with advanced filtering options
 * including domain, language, date range, and recency filters.
 *
 * The tool is executed server-side by the AI Gateway, which handles:
 * - Authentication with Perplexity API
 * - Rate limiting and retry logic
 * - Usage tracking and billing
 * - Observability and logging
 *
 * Must have name `perplexity_search`.
 *
 * @example Basic usage (no config)
 * ```ts
 * import { generateText } from 'ai';
 * import { gateway } from '@ai-sdk/gateway';
 *
 * const result = await generateText({
 *   model: gateway('openai/gpt-4o'),
 *   prompt: 'What are the latest developments in quantum computing?',
 *   tools: {
 *     search: gateway.tools.perplexitySearch(),
 *   },
 * });
 * ```
 *
 * @example With config options
 * ```ts
 * import { streamText } from 'ai';
 * import { gateway } from '@ai-sdk/gateway';
 *
 * const result = await streamText({
 *   model: gateway('anthropic/claude-sonnet-4-20250514'),
 *   prompt: 'Find recent AI research papers',
 *   tools: {
 *     search: gateway.tools.perplexitySearch({
 *       // Limit to 5 results per search
 *       maxResults: 5,
 *       // Only search academic/scientific domains
 *       searchDomainFilter: ['arxiv.org', 'nature.com', 'science.org'],
 *       // Only English results
 *       searchLanguageFilter: ['en'],
 *       // Only results from the past week
 *       searchRecencyFilter: 'week',
 *     }),
 *   },
 * });
 * ```
 *
 * @param config - Configuration options for search defaults
 * @param config.maxResults - Default max results (1-20, default: 10)
 * @param config.maxTokensPerPage - Default tokens per page (256-2048, default: 1024)
 * @param config.country - Default country code for regional results (e.g., 'US')
 * @param config.searchDomainFilter - Default domain include/exclude list
 * @param config.searchLanguageFilter - Default language codes (e.g., ['en', 'fr'])
 * @param config.searchRecencyFilter - Default recency filter ('day'|'week'|'month'|'year')
 * @returns A provider-defined tool for Perplexity Search
 */
export const perplexitySearch = (
    config: PerplexitySearchConfig = {},
) => perplexitySearchToolFactory(config);
