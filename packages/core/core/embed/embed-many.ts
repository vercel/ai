import { Embedding, EmbeddingModel } from '../types';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { splitArray } from '../util/split-array';

/**
Embed several values using an embedding model. The type of the value is defined 
by the embedding model.

`embedMany` automatically splits large requests into smaller chunks if the model
has a limit on how many embeddings can be generated in a single call.

@param model - The embedding model to use.
@param values - The values that should be embedded.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.

@returns A result object that contains the embeddings, the value, and additional information.
 */
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
  values: Array<VALUE>;

  /**
Maximum number of retries per embedding model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;
}): Promise<EmbedManyResult<VALUE>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const maxEmbeddingsPerCall = model.maxEmbeddingsPerCall;

  // the model has not specified limits on
  // how many embeddings can be generated in a single call
  if (maxEmbeddingsPerCall == null) {
    const modelResponse = await retry(() =>
      model.doEmbed({ values, abortSignal }),
    );

    return new EmbedManyResult({
      values,
      embeddings: modelResponse.embeddings,
    });
  }

  // split the values into chunks that are small enough for the model:
  const valueChunks = splitArray(values, maxEmbeddingsPerCall);

  // serially embed the chunks:
  const embeddings = [];
  for (const chunk of valueChunks) {
    const modelResponse = await retry(() =>
      model.doEmbed({ values: chunk, abortSignal }),
    );
    embeddings.push(...modelResponse.embeddings);
  }

  return new EmbedManyResult({ values, embeddings });
}

/**
The result of a `embedMany` call.
It contains the embeddings, the values, and additional information.
 */
export class EmbedManyResult<VALUE> {
  /**
The values that were embedded.
   */
  readonly values: Array<VALUE>;

  /**
The embeddings. They are in the same order as the values.
  */
  readonly embeddings: Array<Embedding>;

  constructor(options: { values: Array<VALUE>; embeddings: Array<Embedding> }) {
    this.values = options.values;
    this.embeddings = options.embeddings;
  }
}
