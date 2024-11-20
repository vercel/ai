export type CohereRerankingModelId =
  | 'rerank-english-v3.0'
  | 'rerank-multilingual-v3.0'
  | 'rerank-english-v2.0'
  | 'rerank-multilingual-v2.0'
  | (string & {});

export interface CohereRerankingSettings {
  /**
   * The maximum number of chunks to produce internally from a document
   *
   */
  max_chunks_per_document?: number;

  /**
   * If a JSON object is provided, you can specify which keys you would like to have considered for reranking.
   * The model will rerank based on order of the fields passed in (i.e. rank_fields=[‘title’,‘author’,‘text’] will rerank using the values in title, author, text sequentially.
   * If the length of title, author, and text exceeds the context length of the model, the chunking will not re-consider earlier fields).
   * If not provided, the model will use the default text field for ranking.
   */
  rank_fields?: string[];
}
