import { Embedding, EmbeddingModel } from '../types';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';

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

export class EmbedResult<VALUE> {
  readonly value: VALUE;
  readonly embedding: Embedding;
  readonly rawResponse?: {
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
