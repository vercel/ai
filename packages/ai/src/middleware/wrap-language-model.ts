import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Middleware,
} from '@ai-sdk/provider';
import { asArray } from '../util/as-array';

/**
 * Wraps a LanguageModelV2 instance with middleware functionality.
 * This function allows you to apply middleware to transform parameters,
 * wrap generate operations, and wrap stream operations of a language model.
 *
 * @param options - Configuration options for wrapping the language model.
 * @param options.model - The original LanguageModelV2 instance to be wrapped.
 * @param options.middleware - The middleware to be applied to the language model. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.modelId - Optional custom model ID to override the original model's ID.
 * @param options.providerId - Optional custom provider ID to override the original model's provider ID.
 * @returns A new LanguageModelV2 instance with middleware applied.
 */
export const wrapLanguageModel = ({
  model,
  middleware: middlewareArg,
  modelId,
  providerId,
}: {
  model: LanguageModelV2;
  middleware: LanguageModelV2Middleware | LanguageModelV2Middleware[];
  modelId?: string;
  providerId?: string;
}): LanguageModelV2 => {
  return asArray(middlewareArg)
    .reverse()
    .reduce((wrappedModel, middleware) => {
      return doWrap({ model: wrappedModel, middleware, modelId, providerId });
    }, model);
};

const doWrap = ({
  model,
  middleware: {
    transformParams,
    wrapGenerate,
    wrapStream,
    overrideProvider,
    overrideModelId,
    overrideSupportedUrls,
  },
  modelId,
  providerId,
}: {
  model: LanguageModelV2;
  middleware: LanguageModelV2Middleware;
  modelId?: string;
  providerId?: string;
}): LanguageModelV2 => {
  async function doTransform({
    params,
    type,
  }: {
    params: LanguageModelV2CallOptions;
    type: 'generate' | 'stream';
  }) {
    return transformParams
      ? await transformParams({ params, type, model })
      : params;
  }

  return {
    specificationVersion: 'v2',

    provider: providerId ?? overrideProvider?.({ model }) ?? model.provider,
    modelId: modelId ?? overrideModelId?.({ model }) ?? model.modelId,
    supportedUrls: overrideSupportedUrls?.({ model }) ?? model.supportedUrls,

    async doGenerate(
      params: LanguageModelV2CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
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
      params: LanguageModelV2CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
      const transformedParams = await doTransform({ params, type: 'stream' });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapStream
        ? wrapStream({ doGenerate, doStream, params: transformedParams, model })
        : doStream();
    },
  };
};
