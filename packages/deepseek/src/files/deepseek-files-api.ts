import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const deepSeekFilesResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      // These fields are required by DeepSeek's OpenAPI schema, but they are
      // not needed to construct the provider reference. Keep them nullish so
      // uploads remain resilient to incomplete responses while validating any
      // returned values precisely enough to avoid misleading metadata.
      object: z.literal('file').nullish(),
      bytes: z.number().int().nonnegative().nullish(),
      created_at: z.number().int().nonnegative().nullish(),
      filename: z.string().nullish(),
      purpose: z.literal('user_data').nullish(),
      expires_at: z.number().int().nonnegative().nullish(),
    }),
  ),
);
