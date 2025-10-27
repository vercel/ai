import { ProviderMetadata } from '../types/provider-metadata';

/**
 * The result of a `rerank` call.
 * It contains the original documents, the reranked documents, and additional information.
 */
export interface RerankResult<VALUE> {
  /**
   * The original documents that were reranked.
   */
  readonly originalDocuments: Array<VALUE>;

  /**
   * Reranked documents.
   *
   * Sorted by relevance score in descending order.
   *
   * Can be less than the original documents if there was a topK limit.
   */
  readonly rerankedDocuments: Array<VALUE>;

  /**
   * The ranking is a list of objects with the original index,
   * relevance score, and the reranked document.
   *
   * Sorted by relevance score in descending order.
   *
   * Can be less than the original documents if there was a topK limit.
   */
  readonly ranking: Array<{
    originalIndex: number;
    relevanceScore: number;
    document: VALUE;
  }>;

  /**
   * Optional provider-specific metadata.
   */
  readonly providerMetadata?: ProviderMetadata;

  /**
   * Optional raw response data.
   */
  readonly response?: {
    /**
     * Response headers.
     */
    headers?: Record<string, string>;

    /**
     * The response body.
     */
    body?: unknown;
  };
}
