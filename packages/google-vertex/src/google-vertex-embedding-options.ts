import { z } from 'zod/v4';

// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api
export type GoogleVertexEmbeddingModelId =
  | 'textembedding-gecko'
  | 'textembedding-gecko@001'
  | 'textembedding-gecko@003'
  | 'textembedding-gecko-multilingual'
  | 'textembedding-gecko-multilingual@001'
  | 'text-multilingual-embedding-002'
  | 'text-embedding-004'
  | 'text-embedding-005'
  | (string & {});

export const googleVertexEmbeddingProviderOptions = z.object({
  /**
   * Optional. Optional reduced dimension for the output embedding.
   * If set, excessive values in the output embedding are truncated from the end.
   */
  outputDimensionality: z.number().optional(),

  /**
   * Optional. Specifies the task type for generating embeddings.
   * Supported task types:
   * - SEMANTIC_SIMILARITY: Optimized for text similarity.
   * - CLASSIFICATION: Optimized for text classification.
   * - CLUSTERING: Optimized for clustering texts based on similarity.
   * - RETRIEVAL_DOCUMENT: Optimized for document retrieval.
   * - RETRIEVAL_QUERY: Optimized for query-based retrieval.
   * - QUESTION_ANSWERING: Optimized for answering questions.
   * - FACT_VERIFICATION: Optimized for verifying factual information.
   * - CODE_RETRIEVAL_QUERY: Optimized for retrieving code blocks based on natural language queries.
   */
  taskType: z
    .enum([
      'SEMANTIC_SIMILARITY',
      'CLASSIFICATION',
      'CLUSTERING',
      'RETRIEVAL_DOCUMENT',
      'RETRIEVAL_QUERY',
      'QUESTION_ANSWERING',
      'FACT_VERIFICATION',
      'CODE_RETRIEVAL_QUERY',
    ])
    .optional(),
});

export type GoogleVertexEmbeddingProviderOptions = z.infer<
  typeof googleVertexEmbeddingProviderOptions
>;
