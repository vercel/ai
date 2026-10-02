import { z } from 'zod/v4';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

export const minimaxErrorResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.string(),
      error: z.object({
        type: z.string(),
        message: z.string(),
        http_code: z.number(),
      }),
      request_id: z.string(),
    }),
  ),
);
