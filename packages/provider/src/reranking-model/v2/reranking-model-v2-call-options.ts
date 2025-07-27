import { JSONValue } from '../../json-value';
import { SharedV2ProviderOptions } from '../../shared';

export type RerankingModelV2CallOptions<VALUE> = {
  /**
List of documents to rerank.
     */
  values: Array<VALUE>;

  /**
The query is a string that represents the query to rerank the documents against.
     */
  query: string;

  /**
The top-k documents after reranking.
    */
  topK: number;

  /**
Return the reranked documents in the response (In same order as indices).
   */
  returnDocuments?: boolean;

  /**
Abort signal for cancelling the operation.
     */
  abortSignal?: AbortSignal;

  /**
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
    */
  providerOptions?: SharedV2ProviderOptions;

  /**
  Additional HTTP headers to be sent with the request.
  Only applicable for HTTP-based providers.
     */
  headers?: Record<string, string | undefined>;
};
