import { z } from 'zod/v4';

// https://console.x.ai and see "View models"
export type XaiChatModelId =
  | 'grok-4'
  | 'grok-4-0709'
  | 'grok-4-latest'
  | 'grok-3'
  | 'grok-3-latest'
  | 'grok-3-fast'
  | 'grok-3-fast-latest'
  | 'grok-3-mini'
  | 'grok-3-mini-latest'
  | 'grok-3-mini-fast'
  | 'grok-3-mini-fast-latest'
  | 'grok-2-vision-1212'
  | 'grok-2-vision'
  | 'grok-2-vision-latest'
  | 'grok-2-image-1212'
  | 'grok-2-image'
  | 'grok-2-image-latest'
  | 'grok-2-1212'
  | 'grok-2'
  | 'grok-2-latest'
  | 'grok-vision-beta'
  | 'grok-beta'
  | (string & {});

// search source schemas
const webSourceSchema = z.object({
  type: z.literal('web'),
  country: z.string().length(2).optional(),
  excludedWebsites: z.array(z.string()).max(5).optional(),
  allowedWebsites: z.array(z.string()).max(5).optional(),
  safeSearch: z.boolean().optional(),
});

const xSourceSchema = z.object({
  type: z.literal('x'),
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

// xai-specific provider options
export const xaiProviderOptions = z.object({
  /**
   * reasoning effort for reasoning models
   * only supported by grok-3-mini and grok-3-mini-fast models
   */
  reasoningEffort: z.enum(['low', 'high']).optional(),

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
       * data sources to search from
       * defaults to ["web", "x"] if not specified
       */
      sources: z.array(searchSourceSchema).optional(),
    })
    .optional(),
});

export type XaiProviderOptions = z.infer<typeof xaiProviderOptions>;
