import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// ImageRouter uses OpenAI-compatible API format
// Response schema based on https://docs.imagerouter.io/api-reference/image-generation
export const imagerouterImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      created: z.number().nullish(),
      data: z.array(
        z.object({
          b64_json: z.string().nullish(),
          url: z.string().nullish(),
          revised_prompt: z.string().nullish(),
        }),
      ),
    }),
  ),
);
