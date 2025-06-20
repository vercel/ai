import { z } from 'zod';

type WebSearchPreviewArgs = {
  /**
   * Search context size to use for the web search.
   */
  searchContextSize?: 'low' | 'medium' | 'high';

  /**
   * User location information to provide geographically relevant search results.
   */
  userLocation?: {
    type?: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
};

export const webSearchPreviewArgsSchema = z.object({
  searchContextSize: z.enum(['low', 'medium', 'high']).optional(),
  userLocation: z
    .object({
      type: z.literal('approximate').optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

export function webSearchPreview(options: WebSearchPreviewArgs = {}): {
  type: 'provider-defined-server';
  id: 'openai.web_search_preview';
  name: 'web_search_preview';
  args: WebSearchPreviewArgs;
  inputSchema: z.ZodType<{}>;
} {
  return {
    type: 'provider-defined-server',
    id: 'openai.web_search_preview',
    name: 'web_search_preview',
    args: {
      searchContextSize: options.searchContextSize,
      userLocation: options.userLocation,
    },
    inputSchema: z.object({}),
  };
} 