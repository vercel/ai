import { z } from 'zod/v4';

export const alibabaEmbeddingModelOptions = z.object({
  /**
   * The number of dimensions for the output embeddings.
   * Available values depend on the model.
   *
   * For `text-embedding-v4`: 2048, 1536, 1024 (default), 768, 512, 256, 128, 64.
   * For `text-embedding-v3`: 1024 (default), 768, 512.
   */
  dimensions: z.number().optional(),

  /**
   * Specifies whether the input is a search query or a document to embed.
   * Use `query` for search queries and `document` for texts to be stored and searched.
   */
  text_type: z.enum(['query', 'document']).optional(),

  /**
   * The type of output vectors to return.
   * Only available for `text-embedding-v4`.
   *
   * - `dense`: returns only dense vectors (default)
   * - `sparse`: returns only sparse vectors
   * - `dense&sparse`: returns both dense and sparse vectors
   */
  output_type: z.enum(['dense', 'sparse', 'dense&sparse']).optional(),
});

export type AlibabaEmbeddingModelOptions = z.infer<
  typeof alibabaEmbeddingModelOptions
>;
