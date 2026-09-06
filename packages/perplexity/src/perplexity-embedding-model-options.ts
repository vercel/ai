import { z } from 'zod/v4';

// https://docs.perplexity.ai/docs/embeddings/quickstart
export type PerplexityEmbeddingModelId =
  | 'pplx-embed-v1-0.6b'
  | 'pplx-embed-v1-4b'
  | (string & {});

export const perplexityEmbeddingModelOptions = z.object({
  /**
   * The number of dimensions the resulting output embeddings should have
   * (Matryoshka truncation). Ranges from 128 up to the model's full size
   * (1024 for 0.6b models, 2560 for 4b models).
   */
  dimensions: z.number().int().positive().optional(),

  /**
   * The quantized encoding format returned by the API. Perplexity does not
   * return floating point embeddings; values are decoded to numbers:
   * - `base64_int8` (default): signed int8 values, compare via cosine similarity.
   * - `base64_binary`: packed bits per byte (0-255), compare via Hamming distance.
   */
  encodingFormat: z.enum(['base64_int8', 'base64_binary']).optional(),
});

export type PerplexityEmbeddingModelOptions = z.infer<
  typeof perplexityEmbeddingModelOptions
>;
