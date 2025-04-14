import { EmbeddingModelV2 } from '../../embedding-model/v2/embedding-model-v2';
import { EmbeddingModelV2CallOptions } from '../../embedding-model/v2/embedding-model-v2-call-options';

/**
 * Middleware for EmbeddingModelV2.
 * This type defines the structure for middleware that can be used to modify
 * the behavior of EmbeddingModelV2 operations.
 */
export type EmbeddingModelV2Middleware<VALUE> = {
  /**
   * Middleware specification version. Use `v2` for the current version.
   */
  middlewareVersion?: 'v2' | undefined; // backwards compatibility

  /**
   * Transforms the parameters before they are passed to the embedding model.
   * @param options - Object containing the parameters.
   * @param options.params - The original parameters for the embedding model call.
   * @returns A promise that resolves to the transformed parameters.
   */
  transformParams?: (options: {
    params: EmbeddingModelV2CallOptions<VALUE>;
  }) => PromiseLike<EmbeddingModelV2CallOptions<VALUE>>;

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
    doEmbed: () => ReturnType<EmbeddingModelV2<VALUE>['doEmbed']>;
    params: EmbeddingModelV2CallOptions<VALUE>;
    model: EmbeddingModelV2<VALUE>;
  }) => Promise<Awaited<ReturnType<EmbeddingModelV2<VALUE>['doEmbed']>>>;
};
