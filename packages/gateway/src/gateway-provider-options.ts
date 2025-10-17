import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://vercel.com/docs/ai-gateway/provider-options
const gatewayProviderOptions = lazySchema(() =>
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
      /**
       * The unique identifier for the end user on behalf of whom the request was made.
       *
       * Used for spend tracking and attribution purposes.
       */
      user: z.string().optional(),
      /**
       * User-specified tags for use in reporting and filtering usage.
       *
       * For example, spend tracking reporting by feature or prompt version.
       *
       * Example: `['chat', 'v2']`
       */
      tags: z.array(z.string()).optional(),
    }),
  ),
);

export type GatewayProviderOptions = InferSchema<typeof gatewayProviderOptions>;
