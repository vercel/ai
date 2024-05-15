import { Embedding, EmbeddingModel } from '../types';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';

/**
Embed a value using an embedding model. The type of the value is defined by the embedding model.

@param model - The embedding model to use.
@param value - The value that should be embedded.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.

@returns A result object that contains the embedding, the value, and additional information.
 */
export async function embed<VALUE>({
  model,
  value,
  maxRetries,
  abortSignal,
}: {
  /**
The embedding model to use.
     */
  model: EmbeddingModel<VALUE>;

  /**
The value that should be embedded.
   */
  value: VALUE;

  /**
Maximum number of retries per embedding model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;
}): Promise<EmbedResult<VALUE>> {
  const retry = retryWithExponentialBackoff({ maxRetries });

  const modelResponse = await retry(() =>
    model.doEmbed({
      values: [value],
      abortSignal,
    }),
  );

  return new EmbedResult({
    value,
    embedding: modelResponse.embeddings[0],
    rawResponse: modelResponse.rawResponse,
  });
}

/**
The result of a `embed` call.
It contains the embedding, the value, and additional information.
 */
export class EmbedResult<VALUE> {
  /**
The value that was embedded.
   */
  readonly value: VALUE;

  /**
The embedding of the value.
  */
  readonly embedding: Embedding;

  /**
Optional raw response data.
   */
  readonly rawResponse?: {
    /**
Response headers.
     */
    headers?: Record<string, string>;
  };

  constructor(options: {
    value: VALUE;
    embedding: Embedding;
    rawResponse?: {
      headers?: Record<string, string>;
    };
  }) {
    this.value = options.value;
    this.embedding = options.embedding;
    this.rawResponse = options.rawResponse;
  }
}
