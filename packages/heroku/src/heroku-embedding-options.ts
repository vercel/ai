import { z } from 'zod/v4';

export type HerokuEmbeddingModelId =
  | 'cohere-embed-multilingual'
  | (string & {});

export const herokuEmbeddingOptions = z.object({
  /**
   * Specifies the type of input passed to the model. Default is `search_document`.
   *
   * - "search_document": Used for embeddings stored in a vector database for search use-cases.
   * - "search_query": Used for embeddings of search queries run against a vector DB to find relevant documents.
   * - "classification": Used for embeddings passed through a text classifier.
   * - "clustering": Used for embeddings run through a clustering algorithm.
   */
  inputType: z
    .enum(['search_document', 'search_query', 'classification', 'clustering'])
    .optional(),

  /**
   * Determines the encoding format of the model's output. Default is `raw`.
   */
  encodingFormat: z.enum(['raw', 'base64']).optional(),

  /**
   * Specifies the type(s) of embeddings to return. Default is `float`.
   */
  embeddingType: z
    .enum(['float', 'int8', 'uint8', 'binary', 'ubinary'])
    .optional(),

  /**
   * Specifies whether to ignore unsupported parameters in request instead of throwing an error.
   * Default is `false`.
   */
  allowIgnoredParams: z.boolean().optional(),
});

export type HerokuEmbeddingOptions = z.infer<typeof herokuEmbeddingOptions>;
