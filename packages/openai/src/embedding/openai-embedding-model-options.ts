import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { OpenAIModelIds } from '../openai-model-catalog';

export type OpenAIEmbeddingModelId =
  | OpenAIModelIds['embedding']
  | (string & {});

export const openaiEmbeddingModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * The number of dimensions the resulting output embeddings should have.
       * Only supported in text-embedding-3 and later models.
       */
      dimensions: z.number().optional(),

      /**
       * A unique identifier representing your end-user, which can help OpenAI to
       * monitor and detect abuse. Learn more.
       */
      user: z.string().optional(),
    }),
  ),
);

export type OpenAIEmbeddingModelOptions = InferSchema<
  typeof openaiEmbeddingModelOptions
>;
