import { SharedV3Headers, SharedV3ProviderMetadata } from '../../shared';
import { EmbeddingModelCallOptions } from './embedding-model-v3-call-options';
import { EmbeddingModelV3Embedding } from './embedding-model-v3-embedding';

/**
Specification for an embedding model that implements the embedding model
interface version 1.

VALUE is the type of the values that the model can embed.
This will allow us to go beyond text embeddings in the future,
e.g. to support image embeddings
 */
export type EmbeddingModelV3<VALUE> = {
  /**
The embedding model must specify which embedding model interface
version it implements. This will allow us to evolve the embedding
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
Limit of how many embeddings can be generated in a single API call.

Use Infinity for models that do not have a limit.
   */
  readonly maxEmbeddingsPerCall:
    | PromiseLike<number | undefined>
    | number
    | undefined;

  /**
True if the model can handle multiple embedding calls in parallel.
   */
  readonly supportsParallelCalls: PromiseLike<boolean> | boolean;

  /**
Generates a list of embeddings for the given input text.

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doEmbed(options: EmbeddingModelCallOptions<VALUE>): PromiseLike<{
    /**
Generated embeddings. They are in the same order as the input values.
     */
    embeddings: Array<EmbeddingModelV3Embedding>;

    /**
Token usage. We only have input tokens for embeddings.
    */
    usage?: { tokens: number };

    /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
     */
    providerMetadata?: SharedV3ProviderMetadata;

    /**
Optional response information for debugging purposes.
     */
    response?: {
      /**
Response headers.
       */
      headers?: SharedV3Headers;

      /**
      The response body.
      */
      body?: unknown;
    };
  }>;
};
