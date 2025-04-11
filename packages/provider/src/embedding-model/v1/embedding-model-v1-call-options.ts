export type EmbeddingModelV1CallOptions<VALUE> = {
  /**
List of values to embed.
   */
  values: Array<VALUE>;

  /**
Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
Additional HTTP headers to be sent with the request.
Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
};
