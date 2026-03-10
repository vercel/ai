import {
  type InferValidator,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type GoogleGenerativeAIEmbeddingModelId =
  | 'gemini-embedding-001'
  | 'text-embedding-004'
  | (string & {});

<<<<<<< HEAD
export const googleGenerativeAIEmbeddingProviderOptions = lazySchema(() =>
=======
const googleEmbeddingContentPartSchema = z.union([
  z.object({ text: z.string() }),
  z.object({
    inlineData: z.object({
      mimeType: z.string(),
      data: z.string(),
    }),
  }),
]);

export const googleEmbeddingModelOptions = lazySchema(() =>
>>>>>>> 35c46d1be (Backport: feat(provider/google): support multimodal embeddings (#13292))
  zodSchema(
    z.object({
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

      /**
       * Optional. Multimodal content parts for embedding non-text content
       * (images, video, PDF, audio). When provided, these parts are used
       * instead of the text values in the embedding request.
       */
      content: z.array(googleEmbeddingContentPartSchema).min(1).optional(),
    }),
  ),
);

export type GoogleGenerativeAIEmbeddingProviderOptions = InferValidator<
  typeof googleGenerativeAIEmbeddingProviderOptions
>;
