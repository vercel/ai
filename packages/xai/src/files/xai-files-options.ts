import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const xaiFilesOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        teamId: z.string().optional(),
        filePath: z.string().optional(),
      })
      .passthrough(),
  ),
);

export type XaiFilesOptions = InferSchema<typeof xaiFilesOptionsSchema>;
