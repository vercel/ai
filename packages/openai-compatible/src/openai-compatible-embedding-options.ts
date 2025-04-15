import { z } from 'zod';

export type OpenAICompatibleEmbeddingModelId = string;

export const openaiCompatibleEmbeddingProviderOptions = z.object({
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
});

export type OpenAICompatibleEmbeddingProviderOptions = z.infer<
  typeof openaiCompatibleEmbeddingProviderOptions
>;
