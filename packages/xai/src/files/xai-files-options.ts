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
       * TTL in seconds measured from upload time; xAI accepts integers
       * between 3600 (1 hour) and 2592000 (30 days) inclusive.
       * Omit to keep the file until it is deleted.
       */
      expiresAfter: z.number().int().min(3600).max(2_592_000).optional(),
    }),
  ),
);

export type XaiFilesOptions = InferSchema<typeof xaiFilesOptionsSchema>;
