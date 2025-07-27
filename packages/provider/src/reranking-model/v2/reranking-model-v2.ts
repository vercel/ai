import { SharedV2Headers } from '../../shared';
import { RerankingModelV2CallOptions } from './reranking-model-v2-call-options';
import { RerankingModelV2Result } from './reranking-model-v2-reranking';

/**
Experimental: Specification for a reranking model that implements the reranking model
interface version 2.

VALUE is the type of the values that the model can rerank.
 */
export type RerankingModelV2<VALUE> = {
  /**
The reranking model must specify which reranking model interface
version it implements. This will allow us to evolve the reranking
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
    */
  readonly specificationVersion: 'v2';

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
  readonly maxDocumentsPerCall:
    | PromiseLike<number | undefined>
    | number
    | undefined;

  /**
True if the model can handle multiple reranking calls in parallel.
    */
  readonly supportsParallelCalls: PromiseLike<boolean> | boolean;

  /**
True if the model can return the input values in the response.
    */
  readonly returnInput: boolean;

  /**
Reranking a list of documents using the query
Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doRerank(options: RerankingModelV2CallOptions<VALUE>): PromiseLike<{
    /**
Reranked indices.
This is an array of objects that contain the index and relevance score
of the documents after reranking.
    */
    rerankedIndices: Array<RerankingModelV2Result>;

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
Optional response information for debugging purposes.
     */
    response?: {
      /**
Response headers.
       */
      headers?: SharedV2Headers;

      /**
      The response body.
      */
      body?: unknown;
    };
  }>;
};
