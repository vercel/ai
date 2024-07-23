import { EmbeddingModel } from '../types';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { EmbedResult } from './embed-result';

/**
Embed a value using an embedding model. The type of the value is defined by the embedding model.

@param model - The embedding model to use.
@param value - The value that should be embedded.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the embedding, the value, and additional information.
 */
export async function embed<VALUE>({
  model,
  value,
  maxRetries,
  abortSignal,
  headers,
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

  /**
Additional headers to include in the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string>;
}): Promise<EmbedResult<VALUE>> {
  const retry = retryWithExponentialBackoff({ maxRetries });

  const modelResponse = await retry(() =>
    model.doEmbed({ values: [value], abortSignal, headers }),
  );

  return new DefaultEmbedResult({
    value,
    embedding: modelResponse.embeddings[0],
    usage: modelResponse.usage ?? { tokens: NaN },
    rawResponse: modelResponse.rawResponse,
  });
}

class DefaultEmbedResult<VALUE> implements EmbedResult<VALUE> {
  readonly value: EmbedResult<VALUE>['value'];
  readonly embedding: EmbedResult<VALUE>['embedding'];
  readonly usage: EmbedResult<VALUE>['usage'];
  readonly rawResponse: EmbedResult<VALUE>['rawResponse'];

  constructor(options: {
    value: EmbedResult<VALUE>['value'];
    embedding: EmbedResult<VALUE>['embedding'];
    usage: EmbedResult<VALUE>['usage'];
    rawResponse?: EmbedResult<VALUE>['rawResponse'];
  }) {
    this.value = options.value;
    this.embedding = options.embedding;
    this.usage = options.usage;
    this.rawResponse = options.rawResponse;
  }
}
