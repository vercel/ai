/**
A RerankIndex is a index of reranking documents.
It is e.g. used to represent a index of original documents that are reranked.
 */
export type RerankingModelV2Result = {
  /**
   * The index of the document in the original list of documents.
   * This is the index of the document after reranking.
   */
  index: number;

  /**
   * The relevance score of the document after reranking.
   * This score is typically a floating-point number
   */
  relevance_score: number;
};
