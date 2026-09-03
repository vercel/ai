import {
  createServerToolFactory,
  lazySchema,
  type ServerToolV1,
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
      query: z
        .string()
        .describe('Natural-language web search query. This is required.'),
      type: z
        .enum(['auto', 'fast', 'instant'])
        .optional()
        .describe(
          'Search method. Use auto for the default balance of speed and quality.',
        ),
      num_results: z
        .number()
        .optional()
        .describe('Maximum number of results to return (1-100, default: 10).'),
      category: z
        .enum([
          'company',
          'people',
          'research paper',
          'news',
          'personal site',
          'financial report',
        ])
        .optional()
        .describe('Optional content category to focus results.'),
      user_location: z
        .string()
        .optional()
        .describe("Two-letter ISO country code such as 'US'."),
      include_domains: z
        .array(z.string())
        .optional()
        .describe('Only return results from these domains.'),
      exclude_domains: z
        .array(z.string())
        .optional()
        .describe('Exclude results from these domains.'),
      start_published_date: z
        .string()
        .optional()
        .describe('Only return links published after this ISO 8601 date.'),
      end_published_date: z
        .string()
        .optional()
        .describe('Only return links published before this ISO 8601 date.'),
      contents: z
        .object({
          text: z
            .union([
              z.boolean(),
              z.object({
                max_characters: z.number().optional(),
                include_html_tags: z.boolean().optional(),
                verbosity: z.enum(['compact', 'standard', 'full']).optional(),
                include_sections: z
                  .array(
                    z.enum([
                      'header',
                      'navigation',
                      'banner',
                      'body',
                      'sidebar',
                      'footer',
                      'metadata',
                    ]),
                  )
                  .optional(),
                exclude_sections: z
                  .array(
                    z.enum([
                      'header',
                      'navigation',
                      'banner',
                      'body',
                      'sidebar',
                      'footer',
                      'metadata',
                    ]),
                  )
                  .optional(),
              }),
            ])
            .optional(),
          highlights: z
            .union([
              z.boolean(),
              z.object({
                query: z.string().optional(),
                max_characters: z.number().optional(),
              }),
            ])
            .optional(),
          max_age_hours: z.number().optional(),
          livecrawl_timeout: z.number().optional(),
          subpages: z.number().optional(),
          subpage_target: z.union([z.string(), z.array(z.string())]).optional(),
          extras: z
            .object({
              links: z.number().optional(),
              image_links: z.number().optional(),
            })
            .optional(),
        })
        .optional()
        .describe('Controls extracted page content and freshness.'),
    }),
  ),
);

const exaSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        requestId: z.string(),
        searchType: z.string().optional(),
        resolvedSearchType: z.string().optional(),
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            id: z.string(),
            publishedDate: z.string().nullable().optional(),
            author: z.string().nullable().optional(),
            image: z.string().nullable().optional(),
            favicon: z.string().nullable().optional(),
            text: z.string().optional(),
            highlights: z.array(z.string()).optional(),
            highlightScores: z.array(z.number()).optional(),
            summary: z.string().optional(),
            subpages: z.array(z.any()).optional(),
            extras: z
              .object({
                links: z.array(z.string()).optional(),
                imageLinks: z.array(z.string()).optional(),
              })
              .optional(),
          }),
        ),
        costDollars: z
          .object({
            total: z.number().optional(),
            search: z.record(z.string(), z.number()).optional(),
          })
          .optional(),
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
        statusCode: z.number().optional(),
        message: z.string(),
      }),
    ]),
  ),
);

const EXA_SEARCH_ORIGIN = 'https://api.exa.ai';

/**
 * Exa's wire format is camelCase while the model-facing input is snake_case,
 * and every field name differs only by that convention. Input has already been
 * validated against `exaSearchInputSchema`, which strips unknown keys, so the
 * schema is the allowlist and a mechanical conversion cannot leak a field Exa
 * would reject.
 */
function toCamelCaseDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toCamelCaseDeep);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const camelKey = key.replace(/_([a-z])/g, (_, character: string) =>
      character.toUpperCase(),
    );
    result[camelKey] = toCamelCaseDeep(nested);
  }
  return result;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'string') {
    return body.slice(0, 200) || `HTTP ${status}`;
  }

  if (typeof body === 'object' && body !== null) {
    const record = body as {
      error?: string | { message?: unknown };
      message?: unknown;
    };
    if (typeof record.error === 'string') {
      return record.error;
    }
    if (
      typeof record.error === 'object' &&
      record.error !== null &&
      typeof record.error.message === 'string'
    ) {
      return record.error.message;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }

  return `HTTP ${status}`;
}

/**
 * Executable definition of the Exa Search tool.
 *
 * Consumed two ways from this single source: clients declare the tool through
 * `exaSearch()` below, and a host that executes it (the AI Gateway, or any
 * server holding an Exa key) reads `modelFacing` to build the schema the model
 * sees and `adapter` to make the call.
 */
export const exaSearchServerTool: ServerToolV1<
  ExaSearchInput,
  ExaSearchOutput
> = {
  specificationVersion: 'server-tool-v1',
  id: 'gateway.exa_search',
  vendor: 'exa',
  contractVersion: 1,
  origins: [EXA_SEARCH_ORIGIN],
  inputSchema: exaSearchInputSchema,
  outputSchema: exaSearchOutputSchema,

  modelFacing: {
    description:
      'Search the web using Exa to find current information and LLM-friendly page excerpts. You MUST provide a query parameter.',
    annotations: {
      query: {
        description:
          'Natural-language web search query. This is REQUIRED. Example: "latest AI regulation updates in 2026"',
      },
      type: {
        description:
          'Search mode. Use auto for the default balance of speed and quality, or fast/instant for lower latency.',
      },
      num_results: {
        description:
          'Maximum number of results to return (1-100, default: 10).',
        default: 10,
      },
      category: {
        description:
          'Optional content category to focus results, such as news, company, research paper, or financial report.',
      },
      user_location: {
        description:
          "Two-letter ISO country code for location-aware search results (e.g., 'US').",
      },
      include_domains: {
        description:
          'Only return results from these domains. Example: ["reuters.com", "arxiv.org"].',
      },
      exclude_domains: {
        description:
          'Exclude results from these domains. Example: ["reddit.com"].',
      },
      start_published_date: {
        description: 'Only return links published after this ISO 8601 date.',
      },
      end_published_date: {
        description: 'Only return links published before this ISO 8601 date.',
      },
      contents: {
        description:
          'Controls extracted page content. If omitted, highlights are requested by default for token-efficient agent use.',
      },
      'contents.max_age_hours': {
        description:
          'Maximum age of cached content in hours. Use 0 to always livecrawl and -1 to never livecrawl.',
      },
      'contents.livecrawl_timeout': {
        description: 'Livecrawl timeout in milliseconds.',
      },
      'contents.subpages': {
        description: 'Number of subpages to crawl per result.',
      },
      'contents.subpage_target': {
        description: 'Keywords to prioritize when selecting subpages.',
      },
    },
  },

  billingDimensions: ['calls', 'requestedResults'],
  lenientFields: ['include_domains', 'exclude_domains'],

  adapter: {
    buildRequest(input) {
      const { contents, ...rest } = input;
      const body = toCamelCaseDeep({
        ...rest,
        type: input.type ?? 'auto',
      }) as Record<string, unknown>;

      // Default to highlights rather than full text: excerpts are what make
      // this tool token-efficient for agent loops.
      body.contents =
        contents === undefined
          ? { highlights: true }
          : toCamelCaseDeep(contents);

      return {
        url: `${EXA_SEARCH_ORIGIN}/search`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        auth: { kind: 'header', name: 'x-api-key' },
      };
    },

    parseResponse(response, input) {
      if (response.status === 429) {
        return {
          ok: false,
          error: 'rate_limit',
          message: extractErrorMessage(response.body, response.status),
          retryAfter: response.header('retry-after'),
        };
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          error: 'api_error',
          message: extractErrorMessage(response.body, response.status),
        };
      }

      const output = response.body as ExaSearchResponse;
      return {
        ok: true,
        output,
        usage: {
          resultCount: output.results?.length ?? 0,
          // Exa's own default when the caller does not ask for a count, and
          // also the number included in the base price.
          requestedResults: input.num_results ?? 10,
        },
      };
    },
  },
};

export const exaSearchToolFactory = createServerToolFactory<
  ExaSearchInput,
  ExaSearchOutput,
  ExaSearchConfig
>(exaSearchServerTool);

export const exaSearch = (
  config: ExaSearchConfig = {},
): ReturnType<typeof exaSearchToolFactory> => exaSearchToolFactory(config);
