export type MistralEmbeddingModelId = 'mistral-embed' | (string & {});

export interface MistralEmbeddingSettings {
  /**
Override the maximum number of embeddings per call.
   */
  maxEmbeddingsPerCall?: number;

  /**
Override the parallelism of embedding calls.
    */
  supportsParallelCalls?: boolean;
}
