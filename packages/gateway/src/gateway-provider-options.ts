import {
  InferValidator,
  lazyValidator,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

// https://vercel.com/docs/ai-gateway/provider-options
const gatewayProviderOptions = lazyValidator(() =>
  zodSchema(
    z.object({
      /**
       * Array of provider slugs that are the only ones allowed to be used.
       *
       * Example: `['azure', 'openai']` will only allow Azure and OpenAI to be used.
       */
      only: z.array(z.string()).optional(),
      /**
       * Array of provider slugs that specifies the sequence in which providers should be attempted.
       *
       * Example: `['bedrock', 'anthropic']` will try Amazon Bedrock first, then Anthropic as fallback.
       */
      order: z.array(z.string()).optional(),
    }),
  ),
);

export type GatewayProviderOptions = InferValidator<
  typeof gatewayProviderOptions
>;
