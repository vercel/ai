import { createProviderDefinedToolFactoryWithOutputSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Args validation schema
export const webFetch_20250910ArgsSchema = z.object({
  /**
   * Maximum number of web fetches Claude can perform during the conversation.
   */
  maxUses: z.number().optional(),

  /**
   * Optional list of domains that Claude is allowed to fetch from.
   */
  allowedDomains: z.array(z.string()).optional(),

  /**
   * Optional list of domains that Claude should avoid when fetching.
   */
  blockedDomains: z.array(z.string()).optional(),

  /**
   * Enable or disable citations for fetched content.
   */
  citations: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),

  /**
   * Maximum content tokens to retrieve from fetched pages.
   */
  maxContentTokens: z.number().optional(),
});

export const webFetch_20250910OutputSchema = z.object({
  url: z.string(),
  content: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  citations: z
    .array(
      z.object({
        text: z.string(),
        source: z.string(),
      }),
    )
    .optional(),
});

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {
    /**
     * The URL to fetch content from.
     */
    url: string;
  },
  {
    url: string;
    content: string;
    title?: string;
    description?: string;
    citations?: Array<{
      text: string;
      source: string;
    }>;
  },
  {
    /**
     * Maximum number of web fetches Claude can perform during the conversation.
     */
    maxUses?: number;

    /**
     * Optional list of domains that Claude is allowed to fetch from.
     */
    allowedDomains?: string[];

    /**
     * Optional list of domains that Claude should avoid when fetching.
     */
    blockedDomains?: string[];

    /**
     * Enable or disable citations for fetched content.
     */
    citations?: {
      enabled: boolean;
    };

    /**
     * Maximum content tokens to retrieve from fetched pages.
     */
    maxContentTokens?: number;
  }
>({
  id: 'anthropic.web_fetch_20250910',
  name: 'web_fetch',
  inputSchema: z.object({
    url: z.string(),
  }),
  outputSchema: webFetch_20250910OutputSchema,
});

export const webFetch_20250910 = (
  args: Parameters<typeof factory>[0] = {}, // default
) => {
  return factory(args);
};