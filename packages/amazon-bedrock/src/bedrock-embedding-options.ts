import { z } from 'zod/v4';

export type BedrockEmbeddingModelId =
  | 'amazon.titan-embed-text-v1'
  | 'amazon.titan-embed-text-v2:0'
  | 'cohere.embed-english-v3'
  | 'cohere.embed-multilingual-v3'
  | (string & {});

export const bedrockEmbeddingProviderOptions = z.object({
  /**
   * The number of dimensions for the output embeddings.
   *
   * Supported values vary by model family:
   * - Titan (`amazon.titan-embed-text-v2:0`): 256, 512, 1024 (default: 1024)
   * - Nova (`amazon.nova-*`): 256, 384, 1024, 3072 (default: 1024)
   * - Cohere (`cohere.embed-v4:0` and newer): 256, 512, 1024, 1536 (default: 1536)
   */
  dimensions: z.number().optional(),

  /**
   * Flag indicating whether or not to normalize the output embeddings. Defaults to true.
   * Only supported in amazon.titan-embed-text-v2:0.
   */
  normalize: z.boolean().optional(),

  /**
   * The purpose of the embedding. Defaults to 'GENERIC_INDEX'.
   * Only supported in amazon.nova-* embedding models.
   */
  embeddingPurpose: z
    .enum([
      'GENERIC_INDEX',
      'TEXT_RETRIEVAL',
      'IMAGE_RETRIEVAL',
      'VIDEO_RETRIEVAL',
      'DOCUMENT_RETRIEVAL',
      'AUDIO_RETRIEVAL',
      'GENERIC_RETRIEVAL',
      'CLASSIFICATION',
      'CLUSTERING',
    ])
    .optional(),

  /**
   * Input type for Cohere embedding models on Bedrock.
   * Common values: `search_document`, `search_query`, `classification`, `clustering`.
   * If not set, the provider defaults to `search_query`.
   */
  inputType: z
    .enum(['search_document', 'search_query', 'classification', 'clustering'])
    .optional(),

  /**
   * Truncation behavior when input exceeds the model's context length.
   * Supported in Cohere and Nova embedding models. Defaults to 'END' for Nova models.
   */
  truncate: z.enum(['NONE', 'START', 'END']).optional(),
});
