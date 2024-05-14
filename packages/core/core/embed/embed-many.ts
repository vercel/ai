import { Embedding, EmbeddingModel } from '../types';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';

export async function embedMany<VALUE>({
  model,
  values,
  maxRetries,
  abortSignal,
}: {
  /**
The embedding model to use.
     */
  model: EmbeddingModel<VALUE>;

  /**
The values that should be embedded.
   */
  values: VALUE[];

  /**
Maximum number of retries per embedding model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;
}): Promise<GenerateEmbeddingResult<VALUE>> {
  const retry = retryWithExponentialBackoff({ maxRetries });

  const modelResponse = await retry(() =>
    model.doEmbed({ values, abortSignal }),
  );

  return new GenerateEmbeddingResult({
    values,
    embeddings: modelResponse.embeddings,
    rawResponse: modelResponse.rawResponse,
  });
}

export class GenerateEmbeddingResult<VALUE> {
  readonly values: VALUE[];
  readonly embeddings: Array<Embedding>;
  readonly rawResponse?: {
    headers?: Record<string, string>;
  };

  constructor(options: {
    values: VALUE[];
    embeddings: Array<Embedding>;
    rawResponse?: {
      headers?: Record<string, string>;
    };
  }) {
    this.values = options.values;
    this.embeddings = options.embeddings;
    this.rawResponse = options.rawResponse;
  }
}
