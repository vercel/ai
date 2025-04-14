import { EmbeddingModelV2Embedding } from './embedding-model-v2-embedding';

/**
Specification for an embedding model that implements the embedding model
interface version 1.

VALUE is the type of the values that the model can embed.
This will allow us to go beyond text embeddings in the future,
e.g. to support image embeddings
 */
export type EmbeddingModelV2<VALUE> = {
  /**
The embedding model must specify which embedding model interface
version it implements. This will allow us to evolve the embedding
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
Limit of how many embeddings can be generated in a single API call.
   */
  readonly maxEmbeddingsPerCall: number | undefined;

  /**
True if the model can handle multiple embedding calls in parallel.
   */
  readonly supportsParallelCalls: boolean;

  /**
Generates a list of embeddings for the given input text.

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doEmbed(options: {
    /**
List of values to embed.
     */
    values: Array<VALUE>;

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
Generated embeddings. They are in the same order as the input values.
     */
    embeddings: Array<EmbeddingModelV2Embedding>;

    /**
Token usage. We only have input tokens for embeddings.
    */
    usage?: { tokens: number };

    /**
Optional response information for debugging purposes.
     */
    response?: {
      /**
Response headers.
       */
      headers?: Record<string, string>;

      /**
      The response body.
      */
      body?: unknown;
    };
  }>;
};
