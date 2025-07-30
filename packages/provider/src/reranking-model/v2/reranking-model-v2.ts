import { SharedV2Headers } from '../../shared';
import { RerankingModelV2CallOptions } from './reranking-model-v2-call-options';
import { RerankedDocument } from './reranking-model-v2-result';

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
Reranking a list of documents using the query
Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doRerank(options: RerankingModelV2CallOptions<VALUE>): PromiseLike<{
    /**
Reranked documents.
This is an array of document that contain the index, relevance score, and the document.
The documents are sorted by the descending order of relevance scores.
    */
    rerankedDocuments: Array<RerankedDocument<VALUE>>;

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
