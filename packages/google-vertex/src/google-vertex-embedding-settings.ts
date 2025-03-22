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

  /**
   * Optional. Specifies the task type for which the embeddings will be used.
   * Used to convey intended downstream application to help the model produce better embeddings.
   * If left blank, the default used is RETRIEVAL_QUERY.
   *
   * Values:
   * - RETRIEVAL_QUERY: Specifies the given text is a query in a search or retrieval setting.
   * - RETRIEVAL_DOCUMENT: Specifies the given text is a document in a search or retrieval setting.
   * - SEMANTIC_SIMILARITY: Specifies the given text is used for Semantic Textual Similarity (STS).
   * - CLASSIFICATION: Specifies that the embedding is used for classification.
   * - CLUSTERING: Specifies that the embedding is used for clustering.
   * - QUESTION_ANSWERING: Specifies that the query embedding is used for answering questions.
   * - FACT_VERIFICATION: Specifies that the query embedding is used for fact verification.
   * - CODE_RETRIEVAL_QUERY: Specifies that the query embedding is used for code retrieval for Java and Python.
   */
  taskType?:
    | 'RETRIEVAL_QUERY'
    | 'RETRIEVAL_DOCUMENT'
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING'
    | 'QUESTION_ANSWERING'
    | 'FACT_VERIFICATION'
    | 'CODE_RETRIEVAL_QUERY'
    | (string & {});

  /**
   * Optional. If set to false, text that exceeds the token limit causes the request to fail.
   * The default value is true.
   */
  autoTruncate?: boolean;
}
