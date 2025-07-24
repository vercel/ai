import { z } from 'zod/v4';

// https://vercel.com/docs/ai-gateway/provider-options
export const gatewayProviderOptions = z.object({
  /**
   * Array of provider slugs that specifies the sequence in which providers should be attempted.
   *
   * Example: `['bedrock', 'anthropic']` will try Amazon Bedrock first, then Anthropic as fallback.
   */
  order: z.array(z.string()).optional(),
});

export type GatewayProviderOptions = z.infer<typeof gatewayProviderOptions>;
