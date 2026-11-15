import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';

export type ExaSearchType = 'auto' | 'fast' | 'instant';

export type ExaSearchCategory =
  | 'company'
  | 'people'
  | 'research paper'
  | 'news'
  | 'personal site'
  | 'financial report';

export type ExaTextSection =
  | 'header'
  | 'navigation'
  | 'banner'
  | 'body'
  | 'sidebar'
  | 'footer'
  | 'metadata';

export interface ExaSearchTextConfig {
  maxCharacters?: number;
  includeHtmlTags?: boolean;
  verbosity?: 'compact' | 'standard' | 'full';
  includeSections?: ExaTextSection[];
  excludeSections?: ExaTextSection[];
}

export interface ExaSearchHighlightsConfig {
  query?: string;
  maxCharacters?: number;
}

export interface ExaSearchExtrasConfig {
  links?: number;
  imageLinks?: number;
}

export interface ExaSearchContentsConfig {
  text?: boolean | ExaSearchTextConfig;
  highlights?: boolean | ExaSearchHighlightsConfig;
  maxAgeHours?: number;
  livecrawlTimeout?: number;
  subpages?: number;
  subpageTarget?: string | string[];
  extras?: ExaSearchExtrasConfig;
}

export interface ExaSearchConfig {
  /**
   * Default search method. Exa defaults to auto when omitted.
   */
  type?: ExaSearchType;

  /**
   * Default maximum number of results to return (1-100, default: 10).
   */
  numResults?: number;

  /**
   * Default category filter for result types.
   */
  category?: ExaSearchCategory;

  /**
   * Default two-letter ISO country code for location-aware search.
   */
  userLocation?: string;

  /**
   * Default domains to include or exclude.
   */
  includeDomains?: string[];
  excludeDomains?: string[];

  /**
   * Default published date filters in ISO 8601 format.
   */
  startPublishedDate?: string;
  endPublishedDate?: string;

  /**
   * Default content extraction controls.
   */
  contents?: ExaSearchContentsConfig;
}

export interface ExaSearchResult {
  title: string;
  url: string;
  id: string;
  publishedDate?: string | null;
  author?: string | null;
  image?: string | null;
  favicon?: string | null;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
  subpages?: ExaSearchResult[];
  extras?: {
    links?: string[];
    imageLinks?: string[];
  };
}

export interface ExaSearchResponse {
  requestId: string;
  searchType?: string;
  resolvedSearchType?: string;
  results: ExaSearchResult[];
  costDollars?: {
    total?: number;
    search?: Record<string, number>;
  };
}

export interface ExaSearchError {
  error:
    | 'api_error'
    | 'rate_limit'
    | 'timeout'
    | 'invalid_input'
    | 'configuration_error'
    | 'execution_error'
    | 'unknown';
  statusCode?: number;
  message: string;
}

export interface ExaSearchInput {
  query: string;
  type?: ExaSearchType;
  num_results?: number;
  category?: ExaSearchCategory;
  user_location?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  start_published_date?: string;
  end_published_date?: string;
  contents?: {
    text?:
      | boolean
      | {
          max_characters?: number;
          include_html_tags?: boolean;
          verbosity?: 'compact' | 'standard' | 'full';
          include_sections?: ExaTextSection[];
          exclude_sections?: ExaTextSection[];
        };
    highlights?:
      | boolean
      | {
          query?: string;
          max_characters?: number;
        };
    max_age_hours?: number;
    livecrawl_timeout?: number;
    subpages?: number;
    subpage_target?: string | string[];
    extras?: {
      links?: number;
      image_links?: number;
    };
  };
}

export type ExaSearchOutput = ExaSearchResponse | ExaSearchError;

const exaSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z.describe(
        z.string(),
        'Natural-language web search query. This is required.',
      ),
      type: z.describe(
        z.optional(z.enum(['auto', 'fast', 'instant'])),
        'Search method. Use auto for the default balance of speed and quality.',
      ),
      num_results: z.describe(
        z.optional(z.number()),
        'Maximum number of results to return (1-100, default: 10).',
      ),
      category: z.describe(
        z.optional(
          z.enum([
            'company',
            'people',
            'research paper',
            'news',
            'personal site',
            'financial report',
          ]),
        ),
        'Optional content category to focus results.',
      ),
      user_location: z.describe(
        z.optional(z.string()),
        "Two-letter ISO country code such as 'US'.",
      ),
      include_domains: z.describe(
        z.optional(z.array(z.string())),
        'Only return results from these domains.',
      ),
      exclude_domains: z.describe(
        z.optional(z.array(z.string())),
        'Exclude results from these domains.',
      ),
      start_published_date: z.describe(
        z.optional(z.string()),
        'Only return links published after this ISO 8601 date.',
      ),
      end_published_date: z.describe(
        z.optional(z.string()),
        'Only return links published before this ISO 8601 date.',
      ),
      contents: z.describe(
        z.optional(
          z.object({
            text: z.optional(
              z.union([
                z.boolean(),
                z.object({
                  max_characters: z.optional(z.number()),
                  include_html_tags: z.optional(z.boolean()),
                  verbosity: z.optional(
                    z.enum(['compact', 'standard', 'full']),
                  ),
                  include_sections: z.optional(
                    z.array(
                      z.enum([
                        'header',
                        'navigation',
                        'banner',
                        'body',
                        'sidebar',
                        'footer',
                        'metadata',
                      ]),
                    ),
                  ),
                  exclude_sections: z.optional(
                    z.array(
                      z.enum([
                        'header',
                        'navigation',
                        'banner',
                        'body',
                        'sidebar',
                        'footer',
                        'metadata',
                      ]),
                    ),
                  ),
                }),
              ]),
            ),
            highlights: z.optional(
              z.union([
                z.boolean(),
                z.object({
                  query: z.optional(z.string()),
                  max_characters: z.optional(z.number()),
                }),
              ]),
            ),
            max_age_hours: z.optional(z.number()),
            livecrawl_timeout: z.optional(z.number()),
            subpages: z.optional(z.number()),
            subpage_target: z.optional(
              z.union([z.string(), z.array(z.string())]),
            ),
            extras: z.optional(
              z.object({
                links: z.optional(z.number()),
                image_links: z.optional(z.number()),
              }),
            ),
          }),
        ),
        'Controls extracted page content and freshness.',
      ),
    }),
  ),
);

const exaSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        requestId: z.string(),
        searchType: z.optional(z.string()),
        resolvedSearchType: z.optional(z.string()),
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            id: z.string(),
            publishedDate: z.optional(z.nullable(z.string())),
            author: z.optional(z.nullable(z.string())),
            image: z.optional(z.nullable(z.string())),
            favicon: z.optional(z.nullable(z.string())),
            text: z.optional(z.string()),
            highlights: z.optional(z.array(z.string())),
            highlightScores: z.optional(z.array(z.number())),
            summary: z.optional(z.string()),
            subpages: z.optional(z.array(z.any())),
            extras: z.optional(
              z.object({
                links: z.optional(z.array(z.string())),
                imageLinks: z.optional(z.array(z.string())),
              }),
            ),
          }),
        ),
        costDollars: z.optional(
          z.object({
            total: z.optional(z.number()),
            search: z.optional(z.record(z.string(), z.number())),
          }),
        ),
      }),
      z.object({
        error: z.enum([
          'api_error',
          'rate_limit',
          'timeout',
          'invalid_input',
          'configuration_error',
          'execution_error',
          'unknown',
        ]),
        statusCode: z.optional(z.number()),
        message: z.string(),
      }),
    ]),
  ),
);

export const exaSearchToolFactory = createProviderExecutedToolFactory<
  ExaSearchInput,
  ExaSearchOutput,
  ExaSearchConfig
>({
  id: 'gateway.exa_search',
  inputSchema: exaSearchInputSchema,
  outputSchema: exaSearchOutputSchema,
});

export const exaSearch = (
  config: ExaSearchConfig = {},
): ReturnType<typeof exaSearchToolFactory> => exaSearchToolFactory(config);
