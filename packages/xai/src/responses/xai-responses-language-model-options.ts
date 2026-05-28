import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4.20-non-reasoning'
  | 'grok-4.20-reasoning'
  | 'grok-4.3'
  | 'grok-latest'
  | (string & {});

// search source schemas
// Kept in sync with `xai-chat-language-model-options.ts`.
const webSourceSchema = z.object({
  type: z.literal('web'),
  country: z.string().length(2).optional(),
  excludedWebsites: z.array(z.string()).max(5).optional(),
  allowedWebsites: z.array(z.string()).max(5).optional(),
  safeSearch: z.boolean().optional(),
});

const xSourceSchema = z.object({
  type: z.literal('x'),
  excludedXHandles: z.array(z.string()).optional(),
  includedXHandles: z.array(z.string()).optional(),
  postFavoriteCount: z.number().int().optional(),
  postViewCount: z.number().int().optional(),
  /**
   * @deprecated use `includedXHandles` instead
   */
  xHandles: z.array(z.string()).optional(),
});

const newsSourceSchema = z.object({
  type: z.literal('news'),
  country: z.string().length(2).optional(),
  excludedWebsites: z.array(z.string()).max(5).optional(),
  safeSearch: z.boolean().optional(),
});

const rssSourceSchema = z.object({
  type: z.literal('rss'),
  links: z.array(z.string().url()).max(1), // currently only supports one RSS link
});

const searchSourceSchema = z.discriminatedUnion('type', [
  webSourceSchema,
  xSourceSchema,
  newsSourceSchema,
  rssSourceSchema,
]);

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiLanguageModelResponsesOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `none` (disables reasoning entirely; supported by
   * `grok-4.3` and newer reasoning models), `low` (uses fewer reasoning
   * tokens), `medium`, and `high` (uses more reasoning tokens).
   *
   * @see https://docs.x.ai/docs/guides/reasoning
   */
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).optional(),
  reasoningSummary: z.enum(['auto', 'concise', 'detailed']).optional(),
  logprobs: z.boolean().optional(),
  topLogprobs: z.number().int().min(0).max(8).optional(),
  /**
   * Whether to store the input message(s) and model response for later retrieval.
   * Must be set to `false` for teams with Zero Data Retention (ZDR) enabled,
   * otherwise the API will return an error.
   * @default true
   */
  store: z.boolean().optional(),
  /**
   * The ID of the previous response from the model.
   */
  previousResponseId: z.string().optional(),
  /**
   * Specify additional output data to include in the model response.
   * Example values: 'file_search_call.results'.
   */
  include: z.array(z.enum(['file_search_call.results'])).nullish(),

  /**
   * Live Search parameters. Supported on the Responses API; when set, this
   * overrides the `web_search` provider tool.
   *
   * @see https://docs.x.ai/docs/guides/live-search
   */
  searchParameters: z
    .object({
      /**
       * search mode preference
       * - "off": disables search completely
       * - "auto": model decides whether to search (default)
       * - "on": always enables search
       */
      mode: z.enum(['off', 'auto', 'on']),

      /**
       * whether to return citations in the response
       * defaults to true
       */
      returnCitations: z.boolean().optional(),

      /**
       * start date for search data (ISO8601 format: YYYY-MM-DD)
       */
      fromDate: z.string().optional(),

      /**
       * end date for search data (ISO8601 format: YYYY-MM-DD)
       */
      toDate: z.string().optional(),

      /**
       * maximum number of search results to consider
       * defaults to 20
       */
      maxSearchResults: z.number().min(1).max(50).optional(),

      /**
       * data sources to search from.
       * defaults to [{ type: 'web' }, { type: 'x' }] if not specified.
       *
       * @example
       * sources: [{ type: 'web', country: 'US' }, { type: 'x' }]
       */
      sources: z.array(searchSourceSchema).optional(),
    })
    .optional(),
});

export type XaiLanguageModelResponsesOptions = z.infer<
  typeof xaiLanguageModelResponsesOptions
>;
