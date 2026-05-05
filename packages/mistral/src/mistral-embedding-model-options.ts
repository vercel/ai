import { z } from 'zod/v4';

export const mistralEmbeddingModelOptions = z.object({
  /**
   * The format of the output data. Defaults to `float`.
   */
  encoding_format: z.enum(['float', 'base64']).optional(),
});

export type MistralEmbeddingModelOptions = z.infer<
  typeof mistralEmbeddingModelOptions
>;
