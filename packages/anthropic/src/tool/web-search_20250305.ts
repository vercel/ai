import { createProviderDefinedToolFactoryWithOutputSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Args validation schema
export const webSearch_20250305ArgsSchema = z.object({
  /**
   * Maximum number of web searches Claude can perform during the conversation.
   */
  maxUses: z.number().optional(),

  /**
   * Optional list of domains that Claude is allowed to search.
   */
  allowedDomains: z.array(z.string()).optional(),

  /**
   * Optional list of domains that Claude should avoid when searching.
   */
  blockedDomains: z.array(z.string()).optional(),

  /**
   * Optional user location information to provide geographically relevant search results.
   */
  userLocation: z
    .object({
      type: z.literal('approximate'),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

export const webSearch_20250305OutputSchema = z.array(
  z.object({
    url: z.string(),
    title: z.string(),
    pageAge: z.string().nullable(),
    encryptedContent: z.string(),
    type: z.string(),
  }),
);

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {
    /**
     * The search query to execute.
     */
    query: string;
  },
  Array<{
    url: string;
    title: string;
    pageAge: string | null;
    encryptedContent: string;
    type: string;
  }>,
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
  name: 'web_search',
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: webSearch_20250305OutputSchema,
});

export const webSearch_20250305 = (
  args: Parameters<typeof factory>[0] = {}, // default
) => {
  return factory(args);
};
