import {
  createProviderDefinedToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const webSearchArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      filters: z
        .object({ allowedDomains: z.array(z.string()).optional() })
        .optional(),
      searchContextSize: z.enum(['low', 'medium', 'high']).optional(),
      userLocation: z
        .object({
          type: z.literal('approximate'),
          country: z.string().optional(),
          city: z.string().optional(),
          region: z.string().optional(),
          timezone: z.string().optional(),
        })
        .optional(),
    }),
  ),
);

const webSearchInputSchema = lazySchema(() => zodSchema(z.object({})));

export const webSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      action: z.discriminatedUnion('type', [
        z.object({
          type: z.literal('search'),
          query: z.string().optional(),
        }),
        z.object({
          type: z.literal('openPage'),
          url: z.string(),
        }),
        z.object({
          type: z.literal('find'),
          url: z.string(),
          pattern: z.string(),
        }),
      ]),
      sources: z
        .array(z.object({ type: z.literal('url'), url: z.string() }))
        .optional(),
    }),
  ),
);

export const webSearchToolFactory =
  createProviderDefinedToolFactoryWithOutputSchema<
    {
      // Web search doesn't take input parameters - it's controlled by the prompt
    },
    {
      /**
       * An object describing the specific action taken in this web search call.
       * Includes details on how the model used the web (search, open_page, find).
       */
      action:
        | {
            /**
             * Action type "search" - Performs a web search query.
             */
            type: 'search';

            /**
             * The search query.
             */
            query?: string;
          }
        | {
            /**
             * Action type "openPage" - Opens a specific URL from search results.
             */
            type: 'openPage';

            /**
             * The URL opened by the model.
             */
            url: string;
          }
        | {
            /**
             * Action type "find": Searches for a pattern within a loaded page.
             */
            type: 'find';

            /**
             * The URL of the page searched for the pattern.
             */
            url: string;

            /**
             * The pattern or text to search for within the page.
             */
            pattern: string;
          };

      /**
       * Optional sources cited by the model for the web search call.
       */
      sources?: { type: 'url'; url: string }[];
    },
    {
      /**
       * Filters for the search.
       */
      filters?: {
        /**
         * Allowed domains for the search.
         * If not provided, all domains are allowed.
         * Subdomains of the provided domains are allowed as well.
         */
        allowedDomains?: string[];
      };

      /**
       * Search context size to use for the web search.
       * - high: Most comprehensive context, highest cost, slower response
       * - medium: Balanced context, cost, and latency (default)
       * - low: Least context, lowest cost, fastest response
       */
      searchContextSize?: 'low' | 'medium' | 'high';

      /**
       * User location information to provide geographically relevant search results.
       */
      userLocation?: {
        /**
         * Type of location (always 'approximate')
         */
        type: 'approximate';
        /**
         * Two-letter ISO country code (e.g., 'US', 'GB')
         */
        country?: string;
        /**
         * City name (free text, e.g., 'Minneapolis')
         */
        city?: string;
        /**
         * Region name (free text, e.g., 'Minnesota')
         */
        region?: string;
        /**
         * IANA timezone (e.g., 'America/Chicago')
         */
        timezone?: string;
      };
    }
  >({
    id: 'openai.web_search',
    name: 'web_search',
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchOutputSchema,
  });

export const webSearch = (
  args: Parameters<typeof webSearchToolFactory>[0] = {}, // default
) => webSearchToolFactory(args);
