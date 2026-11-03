import { z } from 'zod/v4';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

export const anthropicUploadFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      type: z.literal('file').nullish(),
      filename: z.string().nullish(),
      mime_type: z.string().nullish(),
      size_bytes: z.number().nullish(),
      created_at: z.string().nullish(),
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
