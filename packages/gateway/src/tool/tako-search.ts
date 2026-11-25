import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';
import {
  gatewayToolErrorSchema,
  type GatewayToolError,
} from './gateway-tool-error';

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
  /**
   * Serve per-unit-priced data, such as web traffic and SEO. Each such card adds
   * a charge, capped by maxVariableCostUsd. On by default; set false to opt out,
   * and those cards come back as placeholders.
   */
  variableCost?: boolean;
  /**
   * Most one call can be charged in variable cost, in USD. Defaults to 0.25;
   * null removes the cap. Cards that don't fit come back as placeholders with
   * reason 'over_cap'. Can't be combined with variableCost: false.
   */
  maxVariableCostUsd?: number | null;
  /**
   * Extra Tako request fields in snake_case, deep-merged into the body last.
   * Can't set fields this tool models; Tako rejects unknown keys (api_error).
   */
  extraBody?: Record<string, unknown>;
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
  /** Distinct records per premium class (e.g. company_record) among delivered rows. */
  premium_rows?: Record<string, number> | null;
  /** Column header → 0-based delivered-row positions whose premium value was withheld. */
  redacted_cells?: Record<string, number[]> | null;
  /** Full set size when the card lists only a capped slice of it. */
  total_matching?: number | null;
  export_pricing?: {
    baseline_usd: number;
    /** @deprecated Always 0, and Tako will stop sending it. */
    free_rows?: number;
    max_rows_ceiling: number;
    row_cpm_usd: number;
    /** USD per 1,000 premium records by class, added to row_cpm_usd when premium. */
    premium_row_cpm_usd?: Record<string, number> | null;
    /** Upper bound on this card's variable-cost charge; set only for per-unit-priced sources. */
    variable_cost_max_usd?: number | null;
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
  /** Relevance to the query, 1.0-5.0. Null unless the account is entitled. */
  relevance_score?: number | null;
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
  /**
   * Set when Tako withholds the card's data: variable cost off or not served
   * (`not_served`), or over maxVariableCostUsd (`over_cap`).
   */
  placeholder?: {
    withheld_source: string;
    reason?: 'not_served' | 'over_cap' | null;
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
      data_points?: number | null;
    } | null;
    variable_cost?: {
      cost_usd: number;
    } | null;
  } | null;
  related?: Array<Record<string, unknown>> | null;
}

export type TakoSearchError = GatewayToolError;

export type TakoSearchOutput = TakoSearchError | TakoSearchResponse;

const takoDataSourceInputSchema = () =>
  z.object({
    count: z.describe(
      z.optional(z.number()),
      'Maximum number of data results to return (1-20). When include_contents is true, each additional result adds its own data surcharge.',
    ),
    include_contents: z.describe(
      z.optional(z.boolean()),
      'Inline rows for each data result. This adds a data surcharge based on row count and dataset source. To estimate cost, search with include_contents disabled and inspect cards.content.export_pricing. This applies to every returned card; limit sources.data.count and sources.data.max_rows to control cost.',
    ),
    mode: z.describe(
      z.optional(z.enum(['inline', 'url'])),
      'Requested data delivery mode. Search card data is always inline.',
    ),
    content_format: z.describe(
      z.optional(z.enum(['card_json', 'csv', 'json_compact', 'json_records'])),
      'Serialization for inlined card data.',
    ),
    max_rows: z.describe(
      z.optional(z.number()),
      'Maximum rows to inline per result. Omit to use the allowance in cards.content.export_pricing. A data surcharge applies per 1,000 exported rows; lower values reduce cost.',
    ),
    node_ids: z.describe(
      z.optional(z.array(z.string())),
      'Data Graph node IDs to prioritize. Maximum 20.',
    ),
    strict: z.describe(
      z.optional(z.boolean()),
      'Only return cards matching node_ids. Requires a non-empty node_ids.',
    ),
  });

const takoWebSourceInputSchema = () =>
  z.object({
    count: z.describe(
      z.optional(z.number()),
      'Maximum number of web results to return (1-20).',
    ),
    include_contents: z.describe(
      z.optional(z.boolean()),
      'Inline extracted web page text. This can add a data charge.',
    ),
    category: z.describe(
      z.optional(z.enum(['finance', 'news', 'sports'])),
      'Optional web-result category filter.',
    ),
    include_domains: z.describe(
      z.optional(z.array(z.string())),
      'Only return results from these bare domains.',
    ),
    exclude_domains: z.describe(
      z.optional(z.array(z.string())),
      'Exclude results from these bare domains.',
    ),
    snippet_max_chars: z.describe(
      z.optional(z.number()),
      'Maximum characters in each web-result snippet.',
    ),
    highlights: z.describe(
      z.optional(z.boolean()),
      'Include highlighted passages in web results. Defaults to true in AI Gateway.',
    ),
    article_content_max_chars: z.describe(
      z.optional(z.number()),
      'Maximum extracted characters per web page when including contents.',
    ),
    published_after: z.describe(
      z.optional(z.string()),
      'Keep results published on or after this ISO date (YYYY-MM-DD).',
    ),
    published_before: z.describe(
      z.optional(z.string()),
      'Keep results published on or before this ISO date (YYYY-MM-DD).',
    ),
  });

const takoSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z.describe(
        z.string(),
        'Natural-language search query. Include the entity, metric, and time period. Quote a phrase to force it to one entity, for example "Tesla":PRODUCT price.',
      ),
      effort: z.describe(
        z.optional(z.enum(['deep', 'fast', 'instant'])),
        'Search effort. fast is the balanced default, instant favors cached results and low latency, and deep broadens retrieval with reranking at higher cost and latency.',
      ),
      sources: z.describe(
        z.optional(
          z.object({
            data: z.optional(takoDataSourceInputSchema()),
            web: z.optional(takoWebSourceInputSchema()),
          }),
        ),
        'Sources to search. Omit to search both curated data and the web. When provided, only keys present are searched.',
      ),
      location: z.describe(
        z.optional(
          z.object({
            latitude: z.describe(z.number(), 'Latitude between -90 and 90.'),
            longitude: z.describe(
              z.number(),
              'Longitude between -180 and 180.',
            ),
          }),
        ),
        'End-user coordinates for localized results.',
      ),
      country_code: z.describe(
        z.optional(z.string()),
        "Two-letter ISO 3166-1 country code, such as 'US'.",
      ),
      locale: z.describe(
        z.optional(z.string()),
        "BCP-47 locale, such as 'en-US'.",
      ),
      timezone: z.describe(
        z.optional(z.string()),
        "IANA timezone, such as 'America/New_York'.",
      ),
      output_settings: z.describe(
        z.optional(
          z.object({
            image_dark_mode: z.describe(
              z.optional(z.boolean()),
              'Render card preview images in dark mode.',
            ),
            force_refresh: z.describe(
              z.optional(z.boolean()),
              'Instant-effort only. Request a refreshed instant result.',
            ),
          }),
        ),
        'Controls card rendering in the search response.',
      ),
      include_related: z.describe(
        z.optional(z.number()),
        'Maximum related search suggestions to include (1-20).',
      ),
    }),
  ),
);

const takoDatasetCellSchema = () =>
  z.nullable(z.union([z.boolean(), z.number(), z.string()]));

export const takoResultContentSchema = () =>
  z.catchall(
    z.object({
      content_format: z.nullish(
        z.enum(['card_json', 'csv', 'json_compact', 'json_records']),
      ),
      cost: z.optional(z.number()),
      data: z.nullish(z.string()),
      records: z.nullish(
        z.array(z.record(z.string(), takoDatasetCellSchema())),
      ),
      dataset: z.nullish(
        z.object({
          columns: z.array(
            z.object({
              name: z.string(),
              type: z.enum(['boolean', 'date', 'datetime', 'number', 'string']),
              unit: z.nullish(z.string()),
            }),
          ),
          rows: z.array(z.array(takoDatasetCellSchema())),
          total_rows: z.number(),
          truncated: z.boolean(),
          ref: z.string(),
          sources: z.array(
            z.object({
              name: z.string(),
              index: z.optional(z.enum(['data', 'web'])),
            }),
          ),
          provenance: z.optional(z.enum(['query', 'web_extraction'])),
        }),
      ),
      card_data: z.nullish(z.catchall(z.object({}), z.unknown())),
      card_data_schema: z.nullish(z.catchall(z.object({}), z.unknown())),
      url: z.nullish(z.string()),
      expires_at: z.nullish(z.string()),
      total_rows: z.nullish(z.number()),
      truncated: z.optional(z.boolean()),
      premium_rows: z.nullish(z.record(z.string(), z.number())),
      redacted_cells: z.nullish(z.record(z.string(), z.array(z.number()))),
      total_matching: z.nullish(z.number()),
      export_pricing: z.nullish(
        z.catchall(
          z.object({
            baseline_usd: z.number(),
            free_rows: z.optional(z.number()),
            max_rows_ceiling: z.number(),
            row_cpm_usd: z.number(),
            premium_row_cpm_usd: z.nullish(z.record(z.string(), z.number())),
            variable_cost_max_usd: z.nullish(z.number()),
          }),
          z.unknown(),
        ),
      ),
      manifest: z.nullish(
        z.array(
          z.object({
            dtype: z.nullish(
              z.enum(['boolean', 'date', 'datetime', 'number', 'string']),
            ),
            entity: z.nullish(z.string()),
            metric: z.nullish(z.string()),
            name: z.nullish(z.string()),
            unit: z.nullish(z.string()),
          }),
        ),
      ),
    }),
    z.unknown(),
  );

const takoCardSchema = () =>
  z.catchall(
    z.object({
      card_id: z.nullish(z.string()),
      title: z.nullish(z.string()),
      description: z.nullish(z.string()),
      semantic_description: z.nullish(z.string()),
      webpage_url: z.nullish(z.string()),
      image_url: z.nullish(z.string()),
      embed_url: z.nullish(z.string()),
      sources: z.nullish(
        z.array(
          z.object({
            source_name: z.nullish(z.string()),
            source_description: z.nullish(z.string()),
            source_index: z.enum(['data', 'web']),
            source_text: z.nullish(z.string()),
            url: z.nullish(z.string()),
          }),
        ),
      ),
      methodologies: z.nullish(
        z.array(
          z.object({
            methodology_name: z.nullable(z.string()),
            methodology_description: z.nullable(z.string()),
          }),
        ),
      ),
      source_indexes: z.nullish(z.array(z.enum(['data', 'web']))),
      card_type: z.nullish(z.string()),
      relevance: z.nullish(z.enum(['High', 'Low', 'Medium'])),
      relevance_score: z.nullish(z.number()),
      content: z.nullish(takoResultContentSchema()),
      exportable: z.optional(z.boolean()),
      nodes: z.nullish(
        z.array(
          z.object({
            id: z.string(),
            type: z.enum(['entity', 'metric']),
            name: z.string(),
            description: z.nullish(z.string()),
          }),
        ),
      ),
      metric_definitions: z.nullish(
        z.array(z.object({ name: z.string(), definition: z.string() })),
      ),
      data_freshness: z.nullish(
        z.object({
          coverage_end: z.nullish(z.string()),
          data_as_of: z.nullish(z.string()),
          last_updated: z.nullish(z.string()),
        }),
      ),
      placeholder: z.nullish(
        z.catchall(
          z.object({
            withheld_source: z.string(),
            reason: z.nullish(z.enum(['not_served', 'over_cap'])),
          }),
          z.unknown(),
        ),
      ),
    }),
    z.unknown(),
  );

const takoWebResultSchema = () =>
  z.catchall(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.nullish(z.string()),
      source_name: z.nullish(z.string()),
      publish_date: z.nullish(z.string()),
      content: z.nullish(takoResultContentSchema()),
    }),
    z.unknown(),
  );

const takoSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.catchall(
        z.object({
          request_id: z.string(),
          cards: z.optional(z.array(takoCardSchema())),
          web_results: z.optional(z.array(takoWebResultSchema())),
          usage: z.nullish(
            z.catchall(
              z.object({
                total_cost_usd: z.number(),
                compute: z.nullish(
                  z.catchall(z.object({ cost_usd: z.number() }), z.unknown()),
                ),
                data: z.nullish(
                  z.catchall(
                    z.object({
                      cost_usd: z.number(),
                      datasets: z.number(),
                      data_points: z.nullish(z.number()),
                    }),
                    z.unknown(),
                  ),
                ),
                variable_cost: z.nullish(
                  z.catchall(z.object({ cost_usd: z.number() }), z.unknown()),
                ),
              }),
              z.unknown(),
            ),
          ),
          related: z.nullish(z.array(z.catchall(z.object({}), z.unknown()))),
        }),
        z.unknown(),
      ),
      gatewayToolErrorSchema(),
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
