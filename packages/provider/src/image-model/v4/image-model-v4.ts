import type { ImageModelV4CallOptions } from './image-model-v4-call-options';
import type { ImageModelV4Result } from './image-model-v4-result';

type GetMaxImagesPerCallFunction = (options: {
  modelId: string;
}) => PromiseLike<number | undefined> | number | undefined;

type GetMaxImagesPerPromptFunction = (options: {
  modelId: string;
  providerOptions: ImageModelV4CallOptions['providerOptions'];
}) => PromiseLike<number | undefined> | number | undefined;

/**
 * Image generation model specification version 4.
 */
export type ImageModelV4 = {
  /**
   * The image model must specify which image model interface
   * version it implements. This will allow us to evolve the image
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v4';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Limit of how many images can be generated in a single API call.
   * Can be set to a number for a fixed limit, to undefined to use
   * the global limit, or a function that returns a number or undefined,
   * optionally as a promise.
   */
  readonly maxImagesPerCall: number | undefined | GetMaxImagesPerCallFunction;

  /**
   * Optional limit on the total number of images that may be requested for one
   * prompt, regardless of how the AI SDK splits the request into API calls.
   *
   * This can be a function when the limit depends on provider options.
   */
  readonly maxImagesPerPrompt?:
    | number
    | undefined
    | GetMaxImagesPerPromptFunction;

  /**
   * Generates an array of images.
   */
  doGenerate(options: ImageModelV4CallOptions): PromiseLike<ImageModelV4Result>;
};
