import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4-1-fast-reasoning'
  | 'grok-4-1-fast-non-reasoning'
  | 'grok-4'
  | 'grok-4-fast'
  | 'grok-4-fast-non-reasoning'
  | (string & {});

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiLanguageModelResponsesOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `low` (uses fewer reasoning tokens), `medium` and `high` (uses more reasoning tokens).
   */
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  /**
   * Whether to store the input message(s) and model response for later retrieval.
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
   * Parameters to control realtime search data.
   */
  searchParameters: z
    .object({
      /**
       * Search mode preference.
       * - "off": disables search
       * - "auto": model decides whether to search
       * - "on": always enables search
       */
      mode: z.enum(['off', 'auto', 'on']),
      /**
       * Whether to return citations in the response.
       */
      returnCitations: z.boolean().optional(),
      /**
       * Start date for search data (ISO8601 format: YYYY-MM-DD).
       */
      fromDate: z.string().optional(),
      /**
       * End date for search data (ISO8601 format: YYYY-MM-DD).
       */
      toDate: z.string().optional(),
      /**
       * Maximum number of search results to consider.
       */
      maxSearchResults: z.number().min(1).max(30).optional(),
      /**
       * Data sources to search from.
       */
      sources: z
        .array(
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('web'),
              country: z.string().length(2).optional(),
              excludedWebsites: z.array(z.string()).max(5).optional(),
              allowedWebsites: z.array(z.string()).max(5).optional(),
              safeSearch: z.boolean().optional(),
            }),
            z.object({
              type: z.literal('x'),
              excludedXHandles: z.array(z.string()).optional(),
              includedXHandles: z.array(z.string()).optional(),
              postFavoriteCount: z.number().int().optional(),
              postViewCount: z.number().int().optional(),
              xHandles: z.array(z.string()).optional(),
            }),
            z.object({
              type: z.literal('news'),
              country: z.string().length(2).optional(),
              excludedWebsites: z.array(z.string()).max(5).optional(),
              safeSearch: z.boolean().optional(),
            }),
            z.object({
              type: z.literal('rss'),
              links: z.array(z.string().url()).max(1),
            }),
          ]),
        )
        .optional(),
    })
    .optional(),
});

export type XaiLanguageModelResponsesOptions = z.infer<
  typeof xaiLanguageModelResponsesOptions
>;
