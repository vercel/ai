import type { ProviderMetadata } from '../types/provider-metadata';

/**
 * The result of a `rerankMany` call.
 *
 * It contains the original documents, the reranked documents, and additional
 * information aggregated across every reranking model call.
 */
export interface RerankManyResult<VALUE> {
  /**
   * The original documents that were reranked.
   */
  readonly originalDocuments: Array<VALUE>;

  /**
   * Reranked documents.
   *
   * Sorted by relevance score in descending order.
   *
   * Can be less than the original documents if there was a topN limit.
   */
  readonly rerankedDocuments: Array<VALUE>;

  /**
   * The ranking is a list of objects with the original index,
   * relevance score, and the reranked document.
   *
   * Sorted by relevance score in descending order.
   *
   * Can be less than the original documents if there was a topN limit.
   */
  readonly ranking: Array<{
    originalIndex: number;
    score: number;
    document: VALUE;
  }>;

  /**
   * Optional provider-specific metadata, merged across all calls.
   */
  readonly providerMetadata?: ProviderMetadata;

  /**
   * Optional raw response data, one entry per reranking model call
   * (document window).
   */
  readonly responses?: Array<{
    /**
     * ID for the generated response if the provider sends one.
     */
    id?: string;

    /**
     * Timestamp of the generated response.
     */
    timestamp: Date;

    /**
     * The ID of the model that was used to generate the response.
     */
    modelId: string;

    /**
     * Response headers.
     */
    headers?: Record<string, string>;

    /**
     * The response body.
     */
    body?: unknown;
  }>;
}
