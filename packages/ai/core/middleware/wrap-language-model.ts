import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { LanguageModelV1Middleware } from './language-model-v1-middleware';
import { asArray } from '../../util/as-array';

/**
 * Wraps a LanguageModelV1 instance with middleware functionality.
 * This function allows you to apply middleware to transform parameters,
 * wrap generate operations, and wrap stream operations of a language model.
 *
 * @param options - Configuration options for wrapping the language model.
 * @param options.model - The original LanguageModelV1 instance to be wrapped.
 * @param options.middleware - The middleware to be applied to the language model. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.modelId - Optional custom model ID to override the original model's ID.
 * @param options.providerId - Optional custom provider ID to override the original model's provider.
 * @returns A new LanguageModelV1 instance with middleware applied.
 */
export const wrapLanguageModel = ({
  model,
  middleware: middlewareArg,
  modelId,
  providerId,
}: {
  model: LanguageModelV1;
  middleware: LanguageModelV1Middleware | LanguageModelV1Middleware[];
  modelId?: string;
  providerId?: string;
}): LanguageModelV1 => {
  return asArray(middlewareArg)
    .reverse()
    .reduce((wrappedModel, middleware) => {
      return doWrap({ model: wrappedModel, middleware, modelId, providerId });
    }, model);
};

const doWrap = ({
  model,
  middleware: { transformParams, wrapGenerate, wrapStream },
  modelId,
  providerId,
}: {
  model: LanguageModelV1;
  middleware: LanguageModelV1Middleware;
  modelId?: string;
  providerId?: string;
}): LanguageModelV1 => {
  async function doTransform({
    params,
    type,
  }: {
    params: LanguageModelV1CallOptions;
    type: 'generate' | 'stream';
  }) {
    return transformParams ? await transformParams({ params, type }) : params;
  }

  return {
    specificationVersion: 'v1',

    provider: providerId ?? model.provider,
    modelId: modelId ?? model.modelId,

    defaultObjectGenerationMode: model.defaultObjectGenerationMode,
    supportsImageUrls: model.supportsImageUrls,
    supportsUrl: model.supportsUrl?.bind(model),
    supportsStructuredOutputs: model.supportsStructuredOutputs,

    async doGenerate(
      params: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
      const transformedParams = await doTransform({ params, type: 'generate' });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapGenerate
        ? wrapGenerate({
            doGenerate,
            doStream,
            params: transformedParams,
            model,
          })
        : doGenerate();
    },

    async doStream(
      params: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
      const transformedParams = await doTransform({ params, type: 'stream' });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapStream
        ? wrapStream({ doGenerate, doStream, params: transformedParams, model })
        : doStream();
    },
  };
};

/**
 * @deprecated Use `wrapLanguageModel` instead.
 */
// TODO remove in v5
export const experimental_wrapLanguageModel = wrapLanguageModel;
