import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const xaiFilesOptionsSchema = lazySchema(() =>
  zodSchema(
    z.looseObject({
      teamId: z.string().optional(),
      filePath: z.string().optional(),
      /**
       * TTL in seconds measured from upload time (xAI accepts 3600–2592000).
       * Omit to keep the file until it is deleted.
       */
      expiresAfter: z.number().optional(),
    }),
  ),
);

export type XaiFilesOptions = InferSchema<typeof xaiFilesOptionsSchema>;
