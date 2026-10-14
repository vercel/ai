import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';

export type TakoSearchEffort = 'deep' | 'fast' | 'instant';

export type TakoContentFormat =
  | 'card_json'
  | 'csv'
  | 'json_compact'
  | 'json_records';

export interface TakoDataSourceConfig {
  /**
   * Maximum number of data results to return (1-20). When includeContents is
   * true, each additional result adds its own data surcharge.
   */
  count?: number;
  /**
   * Inline rows for each data result. This adds a data surcharge based on row
   * count and dataset source. To estimate cost, search with includeContents
   * disabled and inspect cards.content.export_pricing. This applies to every
   * returned card; limit sources.data.count and sources.data.maxRows to control
   * cost.
   */
  includeContents?: boolean;
  /** Requested delivery mode for card data. Search cards are always inlined. */
  mode?: 'inline' | 'url';
  /** Serialization for inlined card data. */
  contentFormat?: TakoContentFormat;
  /**
   * Maximum rows to inline per result. Omit to use the allowance in
   * cards.content.export_pricing. A data surcharge applies per 1,000 exported
   * rows; lower values reduce cost.
   */
  maxRows?: number;
  /** Data Graph node IDs to prioritize. */
  nodeIds?: string[];
  /** Return only cards matching nodeIds. Requires at least one node ID. */
  strict?: boolean;
}

export interface TakoWebSourceConfig {
  /** Maximum number of web results to return (1-20). */
  count?: number;
  /** Inline extracted web page text. This can add a data charge. */
  includeContents?: boolean;
  /** Optional web-result category filter. */
  category?: 'finance' | 'news' | 'sports';
  /** Only return results from these bare domains. */
  includeDomains?: string[];
  /** Exclude results from these bare domains. */
  excludeDomains?: string[];
  /** Maximum characters in each web-result snippet. */
  snippetMaxChars?: number;
  /** Include highlighted passages in web results. Defaults to true in AI Gateway. */
  highlights?: boolean;
  /** Maximum extracted characters per web page when including contents. */
  articleContentMaxChars?: number;
  /** Keep results published on or after this ISO date. */
  publishedAfter?: string;
  /** Keep results published on or before this ISO date. */
  publishedBefore?: string;
}

export interface TakoSearchConfig {
  /** Search effort. fast is the default balanced option. */
  effort?: TakoSearchEffort;
  /** Sources to search. Omit to search both curated data and the web. */
  sources?: {
    data?: TakoDataSourceConfig;
    web?: TakoWebSourceConfig;
  };
  /** End-user coordinates for localized results. */
  location?: {
    latitude: number;
    longitude: number;
  };
  /** ISO 3166-1 alpha-2 country code. */
  countryCode?: string;
  /** BCP-47 locale. */
  locale?: string;
  /** IANA timezone. */
  timezone?: string;
  /** Settings that control card rendering. */
  outputSettings?: {
    imageDarkMode?: boolean;
    /** Instant-effort only. */
    forceRefresh?: boolean;
  };
  /** Maximum related search suggestions to include (1-20). */
  includeRelated?: number;
}

export interface TakoSearchInput {
  query: string;
  effort?: TakoSearchEffort;
  sources?: {
    data?: {
      count?: number;
      include_contents?: boolean;
      mode?: 'inline' | 'url';
      content_format?: TakoContentFormat;
      max_rows?: number;
      node_ids?: string[];
      strict?: boolean;
    };
    web?: {
      count?: number;
      include_contents?: boolean;
      category?: 'finance' | 'news' | 'sports';
      include_domains?: string[];
      exclude_domains?: string[];
      snippet_max_chars?: number;
      highlights?: boolean;
      article_content_max_chars?: number;
      published_after?: string;
      published_before?: string;
    };
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  country_code?: string;
  locale?: string;
  timezone?: string;
  output_settings?: {
    image_dark_mode?: boolean;
    force_refresh?: boolean;
  };
  include_related?: number;
}

export type TakoDatasetCell = boolean | number | string | null;

export interface TakoResultContent {
  content_format?: TakoContentFormat | null;
  cost?: number;
  data?: string | null;
  records?: Array<Record<string, TakoDatasetCell>> | null;
  dataset?: {
    columns: Array<{
      name: string;
      type: 'boolean' | 'date' | 'datetime' | 'number' | 'string';
      unit?: string | null;
    }>;
    rows: TakoDatasetCell[][];
    total_rows: number;
    truncated: boolean;
    ref: string;
    sources: Array<{
      name: string;
      index?: 'data' | 'web';
    }>;
    provenance?: 'query' | 'web_extraction';
  } | null;
  card_data?: Record<string, unknown> | null;
  card_data_schema?: Record<string, unknown> | null;
  url?: string | null;
  expires_at?: string | null;
  total_rows?: number | null;
  truncated?: boolean;
  export_pricing?: {
    baseline_usd: number;
    free_rows: number;
    max_rows_ceiling: number;
    row_cpm_usd: number;
  } | null;
  manifest?: Array<{
    dtype?: 'boolean' | 'date' | 'datetime' | 'number' | 'string' | null;
    entity?: string | null;
    metric?: string | null;
    name?: string | null;
    unit?: string | null;
  }> | null;
}

export interface TakoCard {
  card_id?: string | null;
  title?: string | null;
  description?: string | null;
  semantic_description?: string | null;
  webpage_url?: string | null;
  image_url?: string | null;
  embed_url?: string | null;
  sources?: Array<{
    source_name?: string | null;
    source_description?: string | null;
    source_index: 'data' | 'web';
    source_text?: string | null;
    url?: string | null;
  }> | null;
  methodologies?: Array<{
    methodology_name: string | null;
    methodology_description: string | null;
  }> | null;
  source_indexes?: Array<'data' | 'web'> | null;
  card_type?: string | null;
  relevance?: 'High' | 'Low' | 'Medium' | null;
  content?: TakoResultContent | null;
  exportable?: boolean;
  nodes?: Array<{
    id: string;
    type: 'entity' | 'metric';
    name: string;
    description?: string | null;
  }> | null;
  metric_definitions?: Array<{
    name: string;
    definition: string;
  }> | null;
  data_freshness?: {
    coverage_end?: string | null;
    data_as_of?: string | null;
    last_updated?: string | null;
  } | null;
}

export interface TakoWebResult {
  title: string;
  url: string;
  snippet?: string | null;
  source_name?: string | null;
  publish_date?: string | null;
  content?: TakoResultContent | null;
}

export interface TakoSearchResponse {
  request_id: string;
  cards?: TakoCard[];
  web_results?: TakoWebResult[];
  usage?: {
    total_cost_usd: number;
    compute?: {
      cost_usd: number;
    } | null;
    data?: {
      cost_usd: number;
      datasets: number;
    } | null;
  } | null;
  related?: Array<Record<string, unknown>> | null;
}

export interface TakoSearchError {
  error:
    | 'api_error'
    | 'configuration_error'
    | 'execution_error'
    | 'invalid_input'
    | 'rate_limit'
    | 'timeout'
    | 'unknown_tool';
  statusCode?: number;
  message: string;
}

export type TakoSearchOutput = TakoSearchError | TakoSearchResponse;

const takoDataSourceInputSchema = z.object({
  count: z
    .number()
    .optional()
    .describe(
      'Maximum number of data results to return (1-20). When include_contents is true, each additional result adds its own data surcharge.',
    ),
  include_contents: z
    .boolean()
    .optional()
    .describe(
      'Inline rows for each data result. This adds a data surcharge based on row count and dataset source. To estimate cost, search with include_contents disabled and inspect cards.content.export_pricing. This applies to every returned card; limit sources.data.count and sources.data.max_rows to control cost.',
    ),
  mode: z
    .enum(['inline', 'url'])
    .optional()
    .describe(
      'Requested data delivery mode. Search card data is always inline.',
    ),
  content_format: z
    .enum(['card_json', 'csv', 'json_compact', 'json_records'])
    .optional()
    .describe('Serialization for inlined card data.'),
  max_rows: z
    .number()
    .optional()
    .describe(
      'Maximum rows to inline per result. Omit to use the allowance in cards.content.export_pricing. A data surcharge applies per 1,000 exported rows; lower values reduce cost.',
    ),
  node_ids: z
    .array(z.string())
    .optional()
    .describe('Data Graph node IDs to prioritize. Maximum 20.'),
  strict: z
    .boolean()
    .optional()
    .describe(
      'Only return cards matching node_ids. Requires a non-empty node_ids.',
    ),
});

const takoWebSourceInputSchema = z.object({
  count: z
    .number()
    .optional()
    .describe('Maximum number of web results to return (1-20).'),
  include_contents: z
    .boolean()
    .optional()
    .describe('Inline extracted web page text. This can add a data charge.'),
  category: z
    .enum(['finance', 'news', 'sports'])
    .optional()
    .describe('Optional web-result category filter.'),
  include_domains: z
    .array(z.string())
    .optional()
    .describe('Only return results from these bare domains.'),
  exclude_domains: z
    .array(z.string())
    .optional()
    .describe('Exclude results from these bare domains.'),
  snippet_max_chars: z
    .number()
    .optional()
    .describe('Maximum characters in each web-result snippet.'),
  highlights: z
    .boolean()
    .optional()
    .describe(
      'Include highlighted passages in web results. Defaults to true in AI Gateway.',
    ),
  article_content_max_chars: z
    .number()
    .optional()
    .describe(
      'Maximum extracted characters per web page when including contents.',
    ),
  published_after: z
    .string()
    .optional()
    .describe('Keep results published on or after this ISO date (YYYY-MM-DD).'),
  published_before: z
    .string()
    .optional()
    .describe(
      'Keep results published on or before this ISO date (YYYY-MM-DD).',
    ),
});

const takoSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z
        .string()
        .describe(
          'Natural-language search query. Include the entity, metric, and time period. Quote a phrase to force it to one entity, for example "Tesla":PRODUCT price.',
        ),
      effort: z
        .enum(['deep', 'fast', 'instant'])
        .optional()
        .describe(
          'Search effort. fast is the balanced default, instant favors cached results and low latency, and deep broadens retrieval with reranking at higher cost and latency.',
        ),
      sources: z
        .object({
          data: takoDataSourceInputSchema.optional(),
          web: takoWebSourceInputSchema.optional(),
        })
        .optional()
        .describe(
          'Sources to search. Omit to search both curated data and the web. When provided, only keys present are searched.',
        ),
      location: z
        .object({
          latitude: z.number().describe('Latitude between -90 and 90.'),
          longitude: z.number().describe('Longitude between -180 and 180.'),
        })
        .optional()
        .describe('End-user coordinates for localized results.'),
      country_code: z
        .string()
        .optional()
        .describe("Two-letter ISO 3166-1 country code, such as 'US'."),
      locale: z.string().optional().describe("BCP-47 locale, such as 'en-US'."),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone, such as 'America/New_York'."),
      output_settings: z
        .object({
          image_dark_mode: z
            .boolean()
            .optional()
            .describe('Render card preview images in dark mode.'),
          force_refresh: z
            .boolean()
            .optional()
            .describe(
              'Instant-effort only. Request a refreshed instant result.',
            ),
        })
        .optional()
        .describe('Controls card rendering in the search response.'),
      include_related: z
        .number()
        .optional()
        .describe('Maximum related search suggestions to include (1-20).'),
    }),
  ),
);

const takoDatasetCellSchema = z
  .union([z.boolean(), z.number(), z.string()])
  .nullable();

const takoResultContentSchema = z
  .object({
    content_format: z
      .enum(['card_json', 'csv', 'json_compact', 'json_records'])
      .nullish(),
    cost: z.number().optional(),
    data: z.string().nullish(),
    records: z.array(z.record(z.string(), takoDatasetCellSchema)).nullish(),
    dataset: z
      .object({
        columns: z.array(
          z.object({
            name: z.string(),
            type: z.enum(['boolean', 'date', 'datetime', 'number', 'string']),
            unit: z.string().nullish(),
          }),
        ),
        rows: z.array(z.array(takoDatasetCellSchema)),
        total_rows: z.number(),
        truncated: z.boolean(),
        ref: z.string(),
        sources: z.array(
          z.object({
            name: z.string(),
            index: z.enum(['data', 'web']).optional(),
          }),
        ),
        provenance: z.enum(['query', 'web_extraction']).optional(),
      })
      .nullish(),
    card_data: z.object({}).passthrough().nullish(),
    card_data_schema: z.object({}).passthrough().nullish(),
    url: z.string().nullish(),
    expires_at: z.string().nullish(),
    total_rows: z.number().nullish(),
    truncated: z.boolean().optional(),
    export_pricing: z
      .object({
        baseline_usd: z.number(),
        free_rows: z.number(),
        max_rows_ceiling: z.number(),
        row_cpm_usd: z.number(),
      })
      .nullish(),
    manifest: z
      .array(
        z.object({
          dtype: z
            .enum(['boolean', 'date', 'datetime', 'number', 'string'])
            .nullish(),
          entity: z.string().nullish(),
          metric: z.string().nullish(),
          name: z.string().nullish(),
          unit: z.string().nullish(),
        }),
      )
      .nullish(),
  })
  .passthrough();

const takoCardSchema = z
  .object({
    card_id: z.string().nullish(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    semantic_description: z.string().nullish(),
    webpage_url: z.string().nullish(),
    image_url: z.string().nullish(),
    embed_url: z.string().nullish(),
    sources: z
      .array(
        z.object({
          source_name: z.string().nullish(),
          source_description: z.string().nullish(),
          source_index: z.enum(['data', 'web']),
          source_text: z.string().nullish(),
          url: z.string().nullish(),
        }),
      )
      .nullish(),
    methodologies: z
      .array(
        z.object({
          methodology_name: z.string().nullable(),
          methodology_description: z.string().nullable(),
        }),
      )
      .nullish(),
    source_indexes: z.array(z.enum(['data', 'web'])).nullish(),
    card_type: z.string().nullish(),
    relevance: z.enum(['High', 'Low', 'Medium']).nullish(),
    content: takoResultContentSchema.nullish(),
    exportable: z.boolean().optional(),
    nodes: z
      .array(
        z.object({
          id: z.string(),
          type: z.enum(['entity', 'metric']),
          name: z.string(),
          description: z.string().nullish(),
        }),
      )
      .nullish(),
    metric_definitions: z
      .array(z.object({ name: z.string(), definition: z.string() }))
      .nullish(),
    data_freshness: z
      .object({
        coverage_end: z.string().nullish(),
        data_as_of: z.string().nullish(),
        last_updated: z.string().nullish(),
      })
      .nullish(),
  })
  .passthrough();

const takoWebResultSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().nullish(),
    source_name: z.string().nullish(),
    publish_date: z.string().nullish(),
    content: takoResultContentSchema.nullish(),
  })
  .passthrough();

const takoSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z
        .object({
          request_id: z.string(),
          cards: z.array(takoCardSchema).optional(),
          web_results: z.array(takoWebResultSchema).optional(),
          usage: z
            .object({
              total_cost_usd: z.number(),
              compute: z.object({ cost_usd: z.number() }).nullish(),
              data: z
                .object({ cost_usd: z.number(), datasets: z.number() })
                .nullish(),
            })
            .nullish(),
          related: z.array(z.object({}).passthrough()).nullish(),
        })
        .passthrough(),
      z.object({
        error: z.enum([
          'api_error',
          'configuration_error',
          'execution_error',
          'invalid_input',
          'rate_limit',
          'timeout',
          'unknown_tool',
        ]),
        statusCode: z.number().optional(),
        message: z.string(),
      }),
    ]),
  ),
);

export const takoSearchToolFactory = createProviderExecutedToolFactory<
  TakoSearchInput,
  TakoSearchOutput,
  TakoSearchConfig
>({
  id: 'gateway.tako_search',
  inputSchema: takoSearchInputSchema,
  outputSchema: takoSearchOutputSchema,
});

export const takoSearch = (
  config: TakoSearchConfig = {},
): ReturnType<typeof takoSearchToolFactory> => takoSearchToolFactory(config);
