import { SharedV3ProviderOptions } from '../../shared';

export type EmbeddingModelCallOptions<VALUE> = {
  /**
 List of values to embed.
 */
  values: Array<VALUE>;

  /**
 Abort signal for cancelling the operation.
 */
  abortSignal?: AbortSignal;

  /**
  Additional provider-specific options. They are passed through
  to the provider from the AI SDK and enable provider-specific
  functionality that can be fully encapsulated in the provider.
  */
  providerOptions?: SharedV3ProviderOptions;

  /**
   Additional HTTP headers to be sent with the request.
   Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string | undefined>;
};
