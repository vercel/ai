import { EmbeddingModelV1Embedding } from './embedding-model-v1-embedding';

/**
Experimental: Specification for an embedding model that implements the embedding model 
interface version 1.

VALUE is the type of the values that the model can embed.
This will allow us to go beyond text embeddings in the future,
e.g. to support image embeddings
 */
export type EmbeddingModelV1<VALUE> = {
  /**
The embedding model must specify which embedding model interface
version it implements. This will allow us to evolve the embedding
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
Generates a list of embeddings for the given input text.

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doEmbed(options: {
    /**
List of values to embed.
     */
    values: Array<VALUE>;
  }): PromiseLike<{
    /**
Generated embeddings. They are in the same order as the input values.
     */
    embeddings: Array<EmbeddingModelV1Embedding>;
  }>;
};
