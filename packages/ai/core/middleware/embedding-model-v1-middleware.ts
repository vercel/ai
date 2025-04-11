import {
  EmbeddingModelV1,
  EmbeddingModelV1CallOptions,
} from '@ai-sdk/provider';

/**
 * Middleware for EmbeddingModelV1.
 * This type defines the structure for middleware that can be used to modify
 * the behavior of EmbeddingModelV1 operations.
 */
export type EmbeddingModelV1Middleware<VALUE> = {
  /**
   * Middleware specification version. Use `v1` for the current version.
   */
  middlewareVersion?: 'v1' | undefined; // backwards compatibility

  /**
   * Transforms the parameters before they are passed to the embedding model.
   * @param options - Object containing the parameters.
   * @param options.params - The original parameters for the embedding model call.
   * @returns A promise that resolves to the transformed parameters.
   */
  transformParams?: (options: {
    params: EmbeddingModelV1CallOptions<VALUE>;
  }) => PromiseLike<EmbeddingModelV1CallOptions<VALUE>>;

  /**
   * Wraps the embed operation of the embedding model.
   * @param options - Object containing the embed function, parameters, and model.
   * @param options.doEmbed - The original embed function.
   * @param options.params - The parameters for the embed call. If the
   * `transformParams` middleware is used, this will be the transformed parameters.
   * @param options.model - The embedding model instance.
   * @returns A promise that resolves to the result of the embed operation.
   */
  wrapEmbed?: (options: {
    doEmbed: () => ReturnType<EmbeddingModelV1<VALUE>['doEmbed']>;
    params: EmbeddingModelV1CallOptions<VALUE>;
    model: EmbeddingModelV1<VALUE>;
  }) => Promise<Awaited<ReturnType<EmbeddingModelV1<VALUE>['doEmbed']>>>;
};
