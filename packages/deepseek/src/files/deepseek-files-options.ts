import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const deepSeekFilesOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Number of seconds after creation before the file expires.
       * Must be between 1 hour and 30 days.
       */
      expiresAfter: z.number().int().min(3600).max(2592000).optional(),
    }),
  ),
);

export type DeepSeekFilesOptions = InferSchema<
  typeof deepSeekFilesOptionsSchema
>;
