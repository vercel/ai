import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Note: For the initial GA launch of Imagen 3, safety filters are not configurable.
// https://ai.google.dev/gemini-api/docs/imagen#imagen-model
export const googleImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      personGeneration: z
        .enum(['dont_allow', 'allow_adult', 'allow_all'])
        .nullish(),
      aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).nullish(),
    }),
  ),
);

export type GoogleImageModelOptions = InferSchema<
  typeof googleImageModelOptionsSchema
>;
