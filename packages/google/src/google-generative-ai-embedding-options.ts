import { z } from 'zod';

export type GoogleGenerativeAIEmbeddingModelId =
  | 'text-embedding-004'
  | (string & {});

export const googleGenerativeAIEmbeddingProviderOptions = z.object({
  /**
   * Optional. Optional reduced dimension for the output embedding.
   * If set, excessive values in the output embedding are truncated from the end.
   */
  outputDimensionality: z.number().optional(),
});

export type GoogleGenerativeAIEmbeddingProviderOptions = z.infer<
  typeof googleGenerativeAIEmbeddingProviderOptions
>;
