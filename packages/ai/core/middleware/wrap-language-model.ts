import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { Experimental_LanguageModelV1Middleware } from './language-model-v1-middleware';

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
