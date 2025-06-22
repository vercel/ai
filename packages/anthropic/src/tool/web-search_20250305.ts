import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const webSearch_20250305 = createProviderDefinedToolFactory<
  {
    /**
     * The search query to execute.
     */
    query: string;
  },
  {
    /**
     * Maximum number of web searches Claude can perform during the conversation.
     */
    maxUses?: number;

    /**
     * Optional list of domains that Claude is allowed to search.
     */
    allowedDomains?: string[];

    /**
     * Optional list of domains that Claude should avoid when searching.
     */
    blockedDomains?: string[];

    /**
     * Optional user location information to provide geographically relevant search results.
     */
    userLocation?: {
      type: 'approximate';
      city?: string;
      region?: string;
      country?: string;
      timezone?: string;
    };
  }
>({
  id: 'anthropic.web_search_20250305',
  inputSchema: z.object({
    query: z.string(),
  }),
});
