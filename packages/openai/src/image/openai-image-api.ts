import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const openaiImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(
        z.object({
          b64_json: z.string(),
          revised_prompt: z.string().optional(),
        }),
      ),
    }),
  ),
);
