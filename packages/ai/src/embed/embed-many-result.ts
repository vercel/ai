import { Embedding } from '../types';
import { EmbeddingModelUsage } from '../types/usage';
import { ProviderMetadata } from '../types';

/**
The result of a `embedMany` call.
It contains the embeddings, the values, and additional information.
 */
export interface EmbedManyResult<VALUE> {
  /**
  The values that were embedded.
     */
  readonly values: Array<VALUE>;

  /**
  The embeddings. They are in the same order as the values.
    */
  readonly embeddings: Array<Embedding>;

  /**
  The embedding token usage.
    */
  readonly usage: EmbeddingModelUsage;

  /**
  Optional provider-specific metadata.
     */
  readonly providerMetadata?: ProviderMetadata;

  /**
  Optional raw response data.
     */
  readonly responses?: Array<
    | {
        /**
  Response headers.
       */
        headers?: Record<string, string>;

        /**
    The response body.
    */
        body?: unknown;
      }
    | undefined
  >;
}
