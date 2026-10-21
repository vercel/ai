import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';

const parallelSearchModes = [
  'turbo',
  'fast',
  'basic',
  'advanced',
  'one-shot',
  'agentic',
] as const;

/**
 * Search mode. `turbo` and `fast` trade excerpt depth for latency (`turbo` is
 * English and Japanese only), `basic` is balanced, `advanced` is the most thorough.
 * Deprecated: `one-shot` (runs as `basic`) and `agentic` (runs as `advanced`).
 */
export type ParallelSearchMode = (typeof parallelSearchModes)[number];

export interface ParallelSearchSourcePolicy {
  /**
   * Domains or domain/path prefixes to restrict results to. When set,
   * `excludeDomains` is ignored. Example: ['wikipedia.org', 'docs.python.org/3']
   */
  includeDomains?: string[];

  /**
   * Domains or domain/path prefixes to exclude from results.
   * Example: ['reddit.com']
   */
  excludeDomains?: string[];

  /**
   * Only include results published on or after this date (YYYY-MM-DD).
   * Example: '2024-01-01'
   */
  afterDate?: string;
}

export interface ParallelSearchExcerpts {
  /**
   * Maximum characters per result.
   */
  maxCharsPerResult?: number;

  /**
   * Maximum total characters across all results.
   * @deprecated Use the top-level `maxCharsTotal` option instead.
   */
  maxCharsTotal?: number;
}

export interface ParallelSearchFetchPolicy {
  /**
   * Maximum age in seconds of cached content before a live fetch is attempted.
   * Minimum 600; lower values are raised to 600.
   */
  maxAgeSeconds?: number;

  /**
   * Timeout in seconds for a live fetch when content is not cached.
   * The gateway caps it to stay within its own tool timeout.
   */
  timeoutSeconds?: number;

  /**
   * Return an error instead of falling back to older cached content when a
   * live fetch fails or times out. Defaults to false.
   */
  disableCacheFallback?: boolean;
}

export interface ParallelSearchConfig {
  /**
   * Search mode. Defaults to `basic`.
   */
  mode?: ParallelSearchMode;

  /**
   * Default maximum number of results to return (1-20).
   * Defaults to 10 if not specified.
   */
  maxResults?: number;

  /**
   * Default source policy for controlling which domains to include/exclude.
   */
  sourcePolicy?: ParallelSearchSourcePolicy;

  /**
   * Default excerpt configuration for controlling result length.
   */
  excerpts?: ParallelSearchExcerpts;

  /**
   * Maximum total characters across all result excerpts.
   */
  maxCharsTotal?: number;

  /**
   * Default fetch policy for controlling content freshness.
   */
  fetchPolicy?: ParallelSearchFetchPolicy;

  /**
   * ISO 3166-1 alpha-2 country code to localize results, e.g. 'us'.
   * Invalid codes are ignored with a warning.
   */
  location?: string;
}

export interface ParallelSearchResult {
  /** URL of the search result */
  url: string;
  /** Title of the page, if available */
  title?: string | null;
  /** Publication date of the page (YYYY-MM-DD), if available */
  publish_date?: string | null;
  /** Relevant excerpts from the page, formatted as markdown */
  excerpts: string[];
}

export interface ParallelSearchWarning {
  /** Warning type, e.g. 'input_validation_warning'. New types may be added. */
  type: string;
  /** Human-readable message */
  message: string;
  /** Optional detail supporting the warning */
  detail?: Record<string, unknown> | null;
}

export interface ParallelSearchUsage {
  /** Usage item name, e.g. 'sku_search' */
  name: string;
  /** Count for the usage item */
  count?: number;
}

export interface ParallelSearchResponse {
  /** Unique identifier for this search request */
  search_id: string;
  /** Search results, ordered by decreasing relevance */
  results: ParallelSearchResult[];
  /** Non-fatal issues with the request, such as an ignored `location` */
  warnings?: ParallelSearchWarning[] | null;
  /** Usage reported by Parallel for this search */
  usage?: ParallelSearchUsage[] | null;
  /** Session identifier shared by the searches made during one request */
  session_id?: string;
}

export interface ParallelSearchError {
  /** Error type */
  error:
    | 'api_error'
    | 'configuration_error'
    | 'execution_error'
    | 'gateway_rate_limit'
    | 'invalid_input'
    | 'rate_limit'
    | 'timeout'
    | 'unknown'
    | 'unknown_tool';
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Human-readable error message */
  message: string;
}

export interface ParallelSearchInput {
  /**
   * Natural-language description of the web research goal.
   * Include source or freshness guidance and broader context from the task.
   * Maximum 5000 characters.
   */
  objective: string;

  /**
   * 2-3 concise keyword queries, 3-6 words each (max 5, 200 characters each).
   */
  search_queries?: string[];

  /**
   * Search mode. Defaults to `basic`.
   */
  mode?: ParallelSearchMode;

  /**
   * Maximum number of results to return (1-20).
   * Defaults to 10 if not specified.
   */
  max_results?: number;

  /**
   * Source policy for controlling which domains to include/exclude.
   */
  source_policy?: {
    include_domains?: string[];
    exclude_domains?: string[];
    after_date?: string;
  };

  /**
   * Excerpt configuration for controlling result length.
   */
  excerpts?: {
    max_chars_per_result?: number;
    /** @deprecated Use the top-level `max_chars_total` instead. */
    max_chars_total?: number;
  };

  /**
   * Maximum total characters across all result excerpts.
   */
  max_chars_total?: number;

  /**
   * Fetch policy for controlling content freshness.
   */
  fetch_policy?: {
    max_age_seconds?: number;
    timeout_seconds?: number;
    disable_cache_fallback?: boolean;
  };

  /**
   * ISO 3166-1 alpha-2 country code to localize results.
   */
  location?: string;
}

export type ParallelSearchOutput = ParallelSearchResponse | ParallelSearchError;

const parallelSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      objective: z
        .string()
        .describe(
          'Natural-language description of the web research goal, including source or freshness guidance and broader context from the task. Maximum 5000 characters.',
        ),

      search_queries: z
        .array(z.string())
        .optional()
        .describe(
          'Provide 2-3 concise keyword queries, 3-6 words each (max 5, 200 chars each). Strongly recommended; the search runs on these queries.',
        ),

      mode: z
        .enum(parallelSearchModes)
        .optional()
        .describe(
          'Search mode: "turbo" and "fast" return quickly with shorter excerpts, "basic" is balanced (default), "advanced" is the most thorough. "turbo" supports English and Japanese only. "one-shot" and "agentic" are deprecated aliases of "basic" and "advanced".',
        ),

      max_results: z
        .number()
        .optional()
        .describe(
          'Maximum number of results to return (1-20). Defaults to 10 if not specified.',
        ),

      source_policy: z
        .object({
          include_domains: z
            .array(z.string())
            .optional()
            .describe(
              "Domains or domain/path prefixes to restrict results to, without scheme or port. Example: ['wikipedia.org', 'docs.python.org/3'].",
            ),
          exclude_domains: z
            .array(z.string())
            .optional()
            .describe(
              "Domains or domain/path prefixes to exclude, without scheme or port. Example: ['reddit.com'].",
            ),
          after_date: z
            .string()
            .optional()
            .describe(
              'Only include results published on or after this date. Use an ISO 8601 calendar date formatted YYYY-MM-DD (e.g. 2025-01-01); do not include a time.',
            ),
        })
        .optional()
        .describe(
          'Source policy for controlling which domains to include/exclude and freshness.',
        ),

      excerpts: z
        .object({
          max_chars_per_result: z
            .number()
            .optional()
            .describe('Maximum characters per result.'),
          max_chars_total: z
            .number()
            .optional()
            .describe('Deprecated: use the top-level max_chars_total.'),
        })
        .optional()
        .describe('Excerpt configuration for controlling result length.'),

      max_chars_total: z
        .number()
        .optional()
        .describe('Maximum total characters across all result excerpts.'),

      fetch_policy: z
        .object({
          max_age_seconds: z
            .number()
            .optional()
            .describe(
              'Maximum age of cached content in seconds before a live fetch, minimum 600.',
            ),
          timeout_seconds: z
            .number()
            .optional()
            .describe(
              'Timeout in seconds for a live fetch when content is not cached. Capped by the gateway tool timeout.',
            ),
          disable_cache_fallback: z
            .boolean()
            .optional()
            .describe(
              'Return an error instead of older cached content when a live fetch fails.',
            ),
        })
        .optional()
        .describe('Fetch policy for controlling content freshness.'),

      location: z
        .string()
        .optional()
        .describe(
          'ISO 3166-1 alpha-2 country code to localize results, e.g. "us".',
        ),
    }),
  ),
);

const parallelSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      // Success response (Parallel's response, passed through by the gateway)
      z.object({
        search_id: z.string(),
        results: z.array(
          z.object({
            url: z.string(),
            title: z.string().nullable().optional(),
            publish_date: z.string().nullable().optional(),
            excerpts: z.array(z.string()),
          }),
        ),
        warnings: z
          .array(
            z.object({
              type: z.string(),
              message: z.string(),
              detail: z.record(z.string(), z.unknown()).nullable().optional(),
            }),
          )
          .nullable()
          .optional(),
        usage: z
          .array(z.object({ name: z.string(), count: z.number().optional() }))
          .nullable()
          .optional(),
        session_id: z.string().optional(),
      }),
      // Error response
      z.object({
        error: z.enum([
          'api_error',
          'configuration_error',
          'execution_error',
          'gateway_rate_limit',
          'invalid_input',
          'rate_limit',
          'timeout',
          'unknown',
          'unknown_tool',
        ]),
        statusCode: z.number().optional(),
        message: z.string(),
      }),
    ]),
  ),
);

export const parallelSearchToolFactory = createProviderExecutedToolFactory<
  ParallelSearchInput,
  ParallelSearchOutput,
  ParallelSearchConfig
>({
  id: 'gateway.parallel_search',
  inputSchema: parallelSearchInputSchema,
  outputSchema: parallelSearchOutputSchema,
});

export const parallelSearch = (
  config: ParallelSearchConfig = {},
): ReturnType<typeof parallelSearchToolFactory> =>
  parallelSearchToolFactory(config);
