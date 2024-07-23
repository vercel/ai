import { Embedding } from '../types';
import { EmbeddingTokenUsage } from '../types/token-usage';

export type EmbedResult<VALUE> = {
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
};
