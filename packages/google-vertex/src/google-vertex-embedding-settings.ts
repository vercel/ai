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

export interface GoogleVertexEmbeddingSettings {
  /**
   * Optional. Optional reduced dimension for the output embedding.
   * If set, excessive values in the output embedding are truncated from the end.
   */
  outputDimensionality?: number;
}
