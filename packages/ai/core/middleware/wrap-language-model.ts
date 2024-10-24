import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { Experimental_LanguageModelV1Middleware } from './language-model-v1-middleware';

/**
 * Wraps a LanguageModelV1 instance with middleware functionality.
 * This function allows you to apply middleware to transform parameters,
 * wrap generate operations, and wrap stream operations of a language model.
 *
 * @param options - Configuration options for wrapping the language model.
 * @param options.model - The original LanguageModelV1 instance to be wrapped.
 * @param options.middleware - The middleware to be applied to the language model.
 * @param options.modelId - Optional custom model ID to override the original model's ID.
 * @param options.providerId - Optional custom provider ID to override the original model's provider.
 * @returns A new LanguageModelV1 instance with middleware applied.
 */
export const experimental_wrapLanguageModel = ({
  model,
  middleware: { transformParams, wrapGenerate, wrapStream },
  modelId,
  providerId,
}: {
  model: LanguageModelV1;
  middleware: Experimental_LanguageModelV1Middleware;
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
    supportsUrl: model.supportsUrl,
    supportsStructuredOutputs: model.supportsStructuredOutputs,

    async doGenerate(
      params: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
      const transformedParams = await doTransform({ params, type: 'generate' });
      const doGenerate = async () => model.doGenerate(transformedParams);
      return wrapGenerate
        ? wrapGenerate({ doGenerate, params: transformedParams, model })
        : doGenerate();
    },

    async doStream(
      params: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
      const transformedParams = await doTransform({ params, type: 'stream' });
      const doStream = async () => model.doStream(transformedParams);
      return wrapStream
        ? wrapStream({ doStream, params: transformedParams, model })
        : doStream();
    },
  };
};
