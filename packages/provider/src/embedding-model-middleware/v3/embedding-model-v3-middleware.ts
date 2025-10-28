import { EmbeddingModelV3 } from '../../embedding-model/v3/embedding-model-v3';
import { EmbeddingModelCallOptions } from '../../embedding-model/v3/embedding-model-v3-call-options';

/**
 * Middleware for EmbeddingModelV3.
 * This type defines the structure for middleware that can be used to modify
 * the behavior of EmbeddingModelV3 operations.
 */
export type EmbeddingModelV3Middleware = {
  /**
   * Middleware specification version. Use `v3` for the current version.
   */
  readonly middlewareVersion: 'v3';

  /**
   * Override the provider name if desired.
   * @param options.model - The language model instance.
   */
  overrideProvider?: (options: { model: EmbeddingModelV3<string> }) => string;

  /**
   * Override the model ID if desired.
   * @param options.model - The language model instance.
   */
  overrideModelId?: (options: { model: EmbeddingModelV3<string> }) => string;

  /**
   * Override the limit of how many embeddings can be generated in a single API call if desired.
   * @param options.model - The language model instance.
   */
  overrideMaxEmbeddingsPerCall?: (options: {
    model: EmbeddingModelV3<string>;
  }) => PromiseLike<number | undefined> | number | undefined;

  /**
   * Override support for handling multiple embedding calls in parallel, if desired..
   * @param options.model - The language model instance.
   */
  overrideSupportsParallelCalls?: (options: {
    model: EmbeddingModelV3<string>;
  }) => PromiseLike<boolean> | boolean;

  /**
   * Transforms the parameters before they are passed to the embed model.
   * @param options - Object containing the type of operation and the parameters.
   * @param options.params - The original parameters for the language model call.
   * @returns A promise that resolves to the transformed parameters.
   */
  transformParams?: (options: {
    params: EmbeddingModelCallOptions<string>;
    model: EmbeddingModelV3<string>;
  }) => PromiseLike<EmbeddingModelCallOptions<string>>;

  /**
   * Wraps the embed operation of the language model.
   *
   * @param options - Object containing the embed function, parameters, and model.
   * @param options.doEmbed - The original embed function.
   * @param options.params - The parameters for the embed call. If the
   * `transformParams` middleware is used, this will be the transformed parameters.
   * @param options.model - The language model instance.
   * @returns A promise that resolves to the result of the generate operation.
   */
  wrapEmbed?: (options: {
    doEmbed: () => ReturnType<EmbeddingModelV3<string>['doEmbed']>;
    params: EmbeddingModelCallOptions<string>;
    model: EmbeddingModelV3<string>;
  }) => Promise<Awaited<ReturnType<EmbeddingModelV3<string>['doEmbed']>>>;
};
