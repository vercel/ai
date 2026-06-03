import { z } from 'zod/v4';

export type AlibabaEmbeddingModelId =
  | 'text-embedding-v4'
  | 'text-embedding-v3'
  | (string & {});

export const alibabaEmbeddingModelOptions = z.object({
  /**
   * Differentiates query text from document text for asymmetric retrieval tasks.
   * Defaults to `document`.
   */
  textType: z.enum(['query', 'document']).optional(),

  /**
   * The dimension of the output embedding vectors. Defaults to 1024.
   *
   * `text-embedding-v4` also supports 1536 and 2048 dimensions.
   */
  dimension: z
    .union([
      z.literal(64),
      z.literal(128),
      z.literal(256),
      z.literal(512),
      z.literal(768),
      z.literal(1024),
      z.literal(1536),
      z.literal(2048),
    ])
    .optional(),

  /**
   * The output vector type. Defaults to `dense`.
   *
   * Sparse-only output is not supported by the AI SDK embedding interface,
   * which requires dense number arrays.
   */
  outputType: z.enum(['dense', 'sparse', 'dense&sparse']).optional(),
});

export type AlibabaEmbeddingModelOptions = z.infer<
  typeof alibabaEmbeddingModelOptions
>;
