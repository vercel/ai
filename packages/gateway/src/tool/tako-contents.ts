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
import {
  takoResultContentSchema,
  type TakoContentFormat,
  type TakoResultContent,
} from './tako-search';

export type TakoContentsMode = 'inline' | 'url';

/**
 * Developer configuration for Tako Contents. Each value overrides the value
 * the model sends in a tool call.
 *
 * A card export is billed at the card's `content.export_pricing`: a baseline
 * plus a rate per 1,000 rows. Premium cells, and cards whose
 * `export_pricing.variable_cost_max_usd` is set, can cost more. Use
 * `quote_only` to get an export's price first. See Tako's pricing page:
 * https://docs.tako.com/documentation/integrating-tako/contents/pricing
 */
export interface TakoContentsConfig {
  /**
   * Delivery mode. `inline`, the default in AI Gateway, returns the content in
   * the tool result. `url` returns a signed download link that expires after a
   * few minutes, for an application that saves the content to a file. A `url`
   * export without `maxRows` exports and bills the whole card, up to 100,000
   * rows.
   */
  mode?: TakoContentsMode;
  /** Serialization for Tako card data. Web pages always return text. */
  contentFormat?: TakoContentFormat;
  /**
   * Maximum card rows to return and bill. A data surcharge applies per 1,000
   * exported rows. A model value is capped at 2,000 in inline mode; this value
   * isn't. Web pages ignore it.
   */
  maxRows?: number;
  /**
   * Maximum characters of a web page's full extracted text. It doesn't apply
   * to highlights, which use `highlights.max_characters`. Tako cards ignore it.
   */
  maxChars?: number;
  /**
   * Reveal a card's premium cells and bill them. Off by default, and the model
   * can't set it. The export then charges
   * `content.export_pricing.premium_row_cpm_usd` per 1,000 premium records on
   * top of the row rate. `card_json` rejects it, and web pages ignore it.
   */
  premium?: boolean;
  /**
   * Limit on each export's quoted price, in USD (0-1,000,000). Defaults to 1.
   * Tako quotes the export before running it, the way `quote_only` does. When
   * the quote is above this limit, the call fails with `invalid_input` and
   * nothing is charged; the error may include the quoted price. The quote is
   * an upper bound, so an export whose charge would have fit can be refused.
   * A `quote_only` call ignores it. Premium and large `url` exports usually
   * need a higher limit.
   */
  maxCostUsd?: number;
  /**
   * Extra Tako request fields in snake_case, deep-merged into the body last.
   * Can't set fields this tool models; Tako rejects unknown keys (invalid_input).
   */
  extraBody?: Record<string, unknown>;
}

/**
 * A card data cell. Columns of type `array` hold an array of objects, or null.
 */
export type TakoContentsCell =
  | boolean
  | number
  | string
  | null
  | Array<Record<string, unknown>>;

export type TakoContentsColumnType =
  | 'array'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'number'
  | 'string';

export interface TakoContentsInput {
  url: string;
  mode?: TakoContentsMode;
  content_format?: TakoContentFormat;
  max_rows?: number;
  offset?: number;
  max_chars?: number;
  highlights?: {
    query?: string;
    max_characters?: number;
  };
  quote_only?: boolean;
}

/**
 * One content item: the Tako Search content shape plus export fields. Card
 * data also allows `array` columns, whose cells are arrays of objects.
 */
export interface TakoContentItem extends Omit<
  TakoResultContent,
  'dataset' | 'manifest' | 'records'
> {
  records?: Array<Record<string, TakoContentsCell>> | null;
  dataset?: {
    columns: Array<{
      name: string;
      type: TakoContentsColumnType;
      unit?: string | null;
    }>;
    rows: TakoContentsCell[][];
    total_rows: number;
    truncated: boolean;
    ref: string;
    sources: Array<{
      name: string;
      index?: 'data' | 'web';
    }>;
    provenance?: 'query' | 'web_extraction';
  } | null;
  manifest?: Array<{
    dtype?: TakoContentsColumnType | null;
    entity?: string | null;
    metric?: string | null;
    name?: string | null;
    unit?: string | null;
    /** Set on a premium column, such as `company_record` or `person_contact`. */
    premium_class?: string | null;
  }> | null;
  /** The URL the call fetched. */
  source_url: string;
  /** How Tako answered: a `quote` (its cost is a price, not a charge), or the content. */
  delivery?: 'inline' | 'quote' | 'url';
  /** Describes the whole card, not only the delivered rows. Null for a web page; may be null on a quote. */
  description?: string | null;
  /** The request's offset, echoed on a card export. */
  offset?: number | null;
  /** True when premium cells are revealed. */
  premium?: boolean;
}

export interface TakoContentsResponse {
  request_id: string;
  /** One item per call today. */
  contents?: TakoContentItem[];
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
}

export type TakoContentsError = GatewayToolError;

export type TakoContentsOutput = TakoContentsError | TakoContentsResponse;

const takoContentsInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      url: z.describe(
        z.string(),
        "The result to fetch: a Tako card's webpage_url or a web result's url, usually from Tako Search. A card URL returns the card's data, and any other URL returns the page's extracted text.",
      ),
      mode: z.describe(
        z.optional(z.enum(['inline', 'url'])),
        'Delivery mode. inline, the default, returns the content in the result. url returns a signed download link that expires after a few minutes; use it only when the application saves the content to a file. A url export without max_rows exports and bills the whole card, up to 100,000 rows.',
      ),
      content_format: z.describe(
        z.optional(
          z.enum(['card_json', 'csv', 'json_compact', 'json_records']),
        ),
        "Serialization for Tako card data. card_json returns the card's own structure, and not every card type supports it. Web pages always return text.",
      ),
      max_rows: z.describe(
        z.optional(z.number()),
        'Maximum card rows to return and bill. A data surcharge applies per 1,000 exported rows; lower values reduce cost. In inline mode it defaults to and is capped at 2,000. A card with a date column keeps its newest rows. Web pages ignore it.',
      ),
      offset: z.describe(
        z.optional(z.number()),
        'Card rows to skip before the export starts (0-100,000). Use it with max_rows to page through a long list, and stop when a call returns fewer rows than max_rows. Cards with a date column, sports cards, and card_json reject an offset above 0. Web pages ignore it.',
      ),
      max_chars: z.describe(
        z.optional(z.number()),
        "Maximum characters of a web page's full extracted text (1-1,000,000). Omit it to return the whole page. It doesn't apply to highlights, which use highlights.max_characters. Tako cards ignore it.",
      ),
      highlights: z.describe(
        z.optional(
          z.object({
            query: z.describe(
              z.optional(z.string()),
              "The question the passages should answer. Omit it to get the page's leading passages.",
            ),
            max_characters: z.describe(
              z.optional(z.number()),
              'Total characters across the returned passages (100-20,000). Defaults to 4,000.',
            ),
          }),
        ),
        'Return only the passages of a web page that answer query, instead of its full text. Tako cards reject it.',
      ),
      quote_only: z.describe(
        z.optional(z.boolean()),
        "Return only the export's price (cost and export_pricing), without fetching content or charging for it. The quote is the most the export can cost, including any variable cost. Use it before a large export, or before exporting a card that can carry variable cost.",
      ),
    }),
  ),
);

const columnTypeSchema = () =>
  z.enum(['array', 'boolean', 'date', 'datetime', 'number', 'string']);

const cellSchema = () =>
  z.nullable(
    z.union([
      z.boolean(),
      z.number(),
      z.string(),
      z.array(z.record(z.string(), z.unknown())),
    ]),
  );

// Overrides the Search shape, which doesn't allow array columns or premium_class.
const takoContentItemSchema = () =>
  z.extend(takoResultContentSchema(), {
    records: z.nullish(z.array(z.record(z.string(), cellSchema()))),
    dataset: z.nullish(
      z.catchall(
        z.object({
          columns: z.array(
            z.object({
              name: z.string(),
              type: columnTypeSchema(),
              unit: z.nullish(z.string()),
            }),
          ),
          rows: z.array(z.array(cellSchema())),
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
        z.unknown(),
      ),
    ),
    manifest: z.nullish(
      z.array(
        z.catchall(
          z.object({
            dtype: z.nullish(columnTypeSchema()),
            entity: z.nullish(z.string()),
            metric: z.nullish(z.string()),
            name: z.nullish(z.string()),
            unit: z.nullish(z.string()),
            premium_class: z.nullish(z.string()),
          }),
          z.unknown(),
        ),
      ),
    ),
    source_url: z.string(),
    delivery: z.optional(z.enum(['inline', 'quote', 'url'])),
    description: z.nullish(z.string()),
    offset: z.nullish(z.number()),
    premium: z.optional(z.boolean()),
  });

const takoContentsOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.catchall(
        z.object({
          request_id: z.string(),
          contents: z.optional(z.array(takoContentItemSchema())),
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
        }),
        z.unknown(),
      ),
      gatewayToolErrorSchema(),
    ]),
  ),
);

export const takoContentsToolFactory = createProviderExecutedToolFactory<
  TakoContentsInput,
  TakoContentsOutput,
  TakoContentsConfig
>({
  id: 'gateway.tako_contents',
  inputSchema: takoContentsInputSchema,
  outputSchema: takoContentsOutputSchema,
});

export const takoContents = (
  config: TakoContentsConfig = {},
): ReturnType<typeof takoContentsToolFactory> =>
  takoContentsToolFactory(config);
