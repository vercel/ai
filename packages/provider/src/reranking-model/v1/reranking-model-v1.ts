import { RerankingModelV1DocumentIndex } from './reranking-model-v1-reranking';

/**
Experimental: Specification for a reranking model that implements the reranking model 
interface version 1.

VALUE is the type of the values that the model can rerank.
 */
export type RerankingModelV1<VALUE> = {
  /**
The reranking model must specify which reranking model interface
version it implements. This will allow us to evolve the reranking
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
    */
  readonly specificationVersion: 'v1';

  /**
Name of the provider for logging purposes.
    */
  readonly provider: string;

  /**
Provider-specific model ID for logging purposes.
    */
  readonly modelId: string;

  /**
Limit of how many documents can be reranking in a single API call.
    */
  readonly maxDocumentsPerCall: number | undefined;

  /**
True if the model can handle multiple reranking calls in parallel.
    */
  readonly supportsParallelCalls: boolean;

  /**
True if the model can return the input values in the response.
    */
  readonly returnInput: boolean;

  /**
Reranking a list of documents using the query
Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doRerank(options: {
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
  Additional HTTP headers to be sent with the request.
  Only applicable for HTTP-based providers.
     */
    headers?: Record<string, string | undefined>;
  }): PromiseLike<{
    /**
Reranked document indices.
    */
    rerankedIndices: Array<RerankingModelV1DocumentIndex>;

    /**
     * This is optional and only send if the returnDocuments flag is set to true.
Reranked documents will be in same order as indices.
    */
    rerankedDocuments?: Array<VALUE>;

    /**
Token usage. We only have input tokens for reranking.
    */
    usage?: { tokens: number };

    /**
Optional raw response information for debugging purposes.
     */
    rawResponse?: {
      /**
Response headers.
       */
      headers?: Record<string, string>;
    };
  }>;
};
