/**
A RerankedDocument is a document that has been reranked.
It contains the index of the document in the original list,
its relevance score after reranking, and the document itself.
*/
export type RerankedDocument<VALUE> = {
  /**
   * The index of the document in the original list of documents.
   * This is the index of the document after reranking.
   */
  index: number;

  /**
   * The relevance score of the document after reranking.
   * This score is typically a floating-point number
   */
  relevanceScore: number;

  /**
   * The document that has been reranked.
   */
  document: VALUE;
};
