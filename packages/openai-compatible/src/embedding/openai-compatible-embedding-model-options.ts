import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAICompatibleEmbeddingModelId = string;

export const openaiCompatibleEmbeddingModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * The number of dimensions the resulting output embeddings should have.
       * Only supported in text-embedding-3 and later models.
       */
      dimensions: z.number().optional(),

      /**
       * A unique identifier representing your end-user, which can help providers to
       * monitor and detect abuse.
       */
      user: z.string().optional(),
    }),
  ),
);

export type OpenAICompatibleEmbeddingModelOptions = InferSchema<
  typeof openaiCompatibleEmbeddingModelOptions
>;
