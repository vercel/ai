import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openaiFilesOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      purpose: z.string(),
      expiresAfter: z.number().optional(),
    }),
  ),
);

export type OpenAIFilesOptions = InferSchema<typeof openaiFilesOptionsSchema>;
