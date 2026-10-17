import type { InferSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const minimaxFilesProviderOptionsSchema = z.object({
  purpose: z
    .union([
      z.literal('voice_clone'),
      z.literal('prompt_audio'),
      z.literal('t2a_async_input'),
      z.string(),
    ])
    .default('t2a_async_input')
    .optional(),
});

export type MiniMaxFilesProviderOptions = InferSchema<
  typeof minimaxFilesProviderOptionsSchema
>;
