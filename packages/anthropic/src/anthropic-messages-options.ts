import { z } from 'zod';

// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-4-opus-20250514'
  | 'claude-4-sonnet-20250514'
  | 'claude-3-7-sonnet-20250219'
  | 'claude-3-5-sonnet-latest'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-5-haiku-latest'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-latest'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | (string & {});

// web search tool options schema
const webSearchLocationSchema = z.object({
  type: z.literal('approximate'),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string(),
  timezone: z.string().optional(),
});

export const anthropicProviderOptions = z.object({
  /**
Include reasoning content in requests sent to the model. Defaults to `true`.

If you are experiencing issues with the model handling requests involving
  */
  sendReasoning: z.boolean().optional(),

  thinking: z
    .object({
      type: z.union([z.literal('enabled'), z.literal('disabled')]),
      budgetTokens: z.number().optional(),
    })
    .optional(),

  /**
   * Web search tool configuration for Claude models that support it.
   * When provided, automatically adds the web search tool to the request.
   */
  webSearch: z
    .object({
      /**
       * Limit the number of searches per request (optional)
       * Defaults to 5 if not specified
       */
      maxUses: z.number().min(1).max(20).optional(),

      /**
       * Only include results from these domains (optional)
       * Cannot be used with blockedDomains
       */
      allowedDomains: z.array(z.string()).optional(),

      /**
       * Never include results from these domains (optional)
       * Cannot be used with allowedDomains
       */
      blockedDomains: z.array(z.string()).optional(),

      /**
       * Localize search results based on user location (optional)
       */
      userLocation: webSearchLocationSchema.optional(),
    })
    .optional(),
});

export type AnthropicProviderOptions = z.infer<typeof anthropicProviderOptions>;
