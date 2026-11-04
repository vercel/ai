import type { SharedV4Headers, SharedV4ProviderOptions } from '../../shared';

export type EmbeddingModelV4CallOptions = {
  /**
   * List of text values to generate embeddings for.
   */
  values: Array<string>;

  /**
   * The requested number of dimensions for the output embeddings.
   * Must be a positive integer. Support and allowed values depend on the model
   * and provider implementation.
   */
  dimensions?: number;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: SharedV4ProviderOptions;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: SharedV4Headers;
};
