import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod';

export const webSearchPreview = createProviderDefinedToolFactory<
  {
    // Web search doesn't take input parameters - it's controlled by the prompt
  },
  {
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
  id: 'openai.web_search_preview',
  inputSchema: z.object({}),
});
