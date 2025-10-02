import {
  SharedV2Headers,
  SharedV2ProviderMetadata,
  SharedV2ProviderOptions,
} from '../../shared';
import { RerankingModelV3CallOptions } from './reranking-model-v3-call-options';
import { RerankedDocument } from './reranking-model-v3-result';

/**
Experimental: Specification for a reranking model that implements the reranking model
interface version 3.

VALUE is the type of the values that the model can rerank.
 */
export type RerankingModelV3<VALUE> = {
  /**
The reranking model must specify which reranking model interface
version it implements. This will allow us to evolve the reranking
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
    */
  readonly specificationVersion: 'v3';

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
  doRerank(options: RerankingModelV3CallOptions<VALUE>): PromiseLike<{
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
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
    */
    providerMetadata?: SharedV2ProviderMetadata;

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
