import { z } from 'zod/v4';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

export const baseResponseSchema = z.object({
  status_code: z.number(),
  status_msg: z.string(),
});

export const minimaxFilesResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      file: z.object({
        file_id: z.number(),
        bytes: z.number(),
        created_at: z.number(),
        filename: z.string(),
        purpose: z.string(),
      }),
      base_resp: baseResponseSchema,
    }),
  ),
);

export const minimaxFilesDeleteResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      file_id: z.number(),
      base_resp: baseResponseSchema,
    }),
  ),
);
