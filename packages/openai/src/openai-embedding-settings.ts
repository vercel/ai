export type OpenAIEmbeddingModelId =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002'
  | (string & {});

export interface OpenAIEmbeddingSettings {
  /**
Override the maximum number of embeddings per call.
   */
  maxEmbeddingsPerCall?: number;

  /**
Override the parallelism of embedding calls.
    */
  supportsParallelCalls?: boolean;

  /**
The number of dimensions the resulting output embeddings should have.
Only supported in text-embedding-3 and later models.
   */
  dimensions?: number;

  /**
A unique identifier representing your end-user, which can help OpenAI to
monitor and detect abuse. Learn more.
*/
  user?: string;
}
