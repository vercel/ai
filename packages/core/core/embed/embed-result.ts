import { Embedding } from '../types';
import { EmbeddingTokenUsage } from '../types/token-usage';

/**
The result of a `embed` call.
It contains the embedding, the value, and additional information.
 */
export interface EmbedResult<VALUE> {
  /**
  The value that was embedded.
     */
  readonly value: VALUE;

  /**
  The embedding of the value.
    */
  readonly embedding: Embedding;

  /**
  The embedding token usage.
    */
  readonly usage: EmbeddingTokenUsage;

  /**
  Optional raw response data.
     */
  readonly rawResponse?: {
    /**
  Response headers.
       */
    headers?: Record<string, string>;
  };
}
