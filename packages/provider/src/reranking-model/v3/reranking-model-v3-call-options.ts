import { JSONValue } from '../../json-value';
import { SharedV3Headers, SharedV3ProviderOptions } from '../../shared/v3';

export type RerankingModelV3CallOptions = {
  /**
   * Documents to rerank.
   * Either a list of text documents or a list of JSON documents.
   */
  documents:
    | { type: 'text'; values: string[] }
    | { type: 'json'; values: JSONValue[] };

  /**
   * The query is a string that represents the query to rerank the documents against.
   */
  query: string;

  /**
   * Limit returned documents to the top k documents.
   */
  topK: number;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: SharedV3ProviderOptions;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: SharedV3Headers;
};
