import { z } from 'zod';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

export const anthropicUploadFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      type: z.literal('file'),
      filename: z.string(),
      mime_type: z.string(),
      size_bytes: z.number(),
      created_at: z.string(),
      downloadable: z.boolean().nullish(),
    }),
  ),
);

export const anthropicDeleteFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('file_deleted').optional(),
      id: z.string(),
    }),
  ),
);
