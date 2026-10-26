import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const huggingfaceLanguageModelResponsesOptions = lazySchema(() =>
  zodSchema(
    z.object({
      metadata: z.record(z.string(), z.string()).optional(),
      instructions: z.string().optional(),
      strictJsonSchema: z.boolean().optional(),
      reasoningEffort: z.string().optional(),
    }),
  ),
);

export type HuggingFaceLanguageModelResponsesOptions = InferSchema<
  typeof huggingfaceLanguageModelResponsesOptions
>;
