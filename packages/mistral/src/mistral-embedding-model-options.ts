import { z } from 'zod/v4';

export const mistralEmbeddingModelOptions = z.object({
  /**
   * The format to return the embeddings in.
   * Defaults to `"float"`.
   *
   * - `"float"`: Returns embeddings as an array of 32-bit floating-point numbers.
   * - `"base64"`: Returns embeddings as a base64-encoded string, which can
   *   reduce bandwidth for large batches.
   */
  encodingFormat: z.enum(['float', 'base64']).optional(),
});

export type MistralEmbeddingModelOptions = z.infer<
  typeof mistralEmbeddingModelOptions
>;
