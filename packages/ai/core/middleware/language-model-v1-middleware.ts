import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';

/**
 * Experimental middleware for LanguageModelV1.
 * This type defines the structure for middleware that can be used to modify
 * the behavior of LanguageModelV1 operations.
 */
export type Experimental_LanguageModelV1Middleware = {
  /**
   * Transforms the parameters before they are passed to the language model.
   * @param options - Object containing the type of operation and the parameters.
   * @param options.type - The type of operation ('generate' or 'stream').
   * @param options.params - The original parameters for the language model call.
   * @returns A promise that resolves to the transformed parameters.
   */
  transformParams?: (options: {
    type: 'generate' | 'stream';
    params: LanguageModelV1CallOptions;
  }) => PromiseLike<LanguageModelV1CallOptions>;

  /**
   * Wraps the generate operation of the language model.
   * @param options - Object containing the generate function, parameters, and model.
   * @param options.doGenerate - The original generate function.
   * @param options.params - The parameters for the generate call. If the
   * `transformParams` middleware is used, this will be the transformed parameters.
   * @param options.model - The language model instance.
   * @returns A promise that resolves to the result of the generate operation.
   */
  wrapGenerate?: (options: {
    doGenerate: () => ReturnType<LanguageModelV1['doGenerate']>;
    params: LanguageModelV1CallOptions;
    model: LanguageModelV1;
  }) => Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>>;

  /**
   * Wraps the stream operation of the language model.
   * @param options - Object containing the stream function, parameters, and model.
   * @param options.doStream - The original stream function.
   * @param options.params - The parameters for the stream call. If the
   * `transformParams` middleware is used, this will be the transformed parameters.
   * @param options.model - The language model instance.
   * @returns A promise that resolves to the result of the stream operation.
   */
  wrapStream?: (options: {
    doStream: () => ReturnType<LanguageModelV1['doStream']>;
    params: LanguageModelV1CallOptions;
    model: LanguageModelV1;
  }) => PromiseLike<Awaited<ReturnType<LanguageModelV1['doStream']>>>;
};
