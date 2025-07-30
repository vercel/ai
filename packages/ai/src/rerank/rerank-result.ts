import { RerankingModelUsage } from '../types/usage';
import { RerankedDocument } from '../types/reranking-model';

/**
The result of an `rerank` call.
It contains the documents, the reranked results, and additional information.
 */
export interface RerankResult<VALUE> {
  /**
  The documents that were reranked.
    */
  readonly documents: Array<VALUE>;

  /**
  The reranked documents is the list of object with the index, relevance score, and the document that have been reranked.
    */
  readonly rerankedDocuments: Array<RerankedDocument<VALUE>>;

  /**
  The reranking token usage.
    */
  readonly usage: RerankingModelUsage;

  /**
  Optional raw response data.
     */
  readonly response?: {
    /**
  Response headers.
       */
    headers?: Record<string, string>;

    /**
    The response body.
    */
    body?: unknown;
  };
}
