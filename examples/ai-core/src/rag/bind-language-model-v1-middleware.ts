import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { LanguageModelV1Middleware } from './language-model-v1-middleware';

export const bindLanguageModelV1Middleware = ({
  model,
  middleware: { transformParams, wrapGenerate, wrapStream },
}: {
  model: LanguageModelV1;
  middleware: LanguageModelV1Middleware;
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
    provider: model.provider,
    modelId: model.modelId,
    defaultObjectGenerationMode: model.defaultObjectGenerationMode,

    async doGenerate(
      params: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
      const doGenerate = async () =>
        model.doGenerate(await doTransform({ params, type: 'generate' }));
      return wrapGenerate ? wrapGenerate({ doGenerate }) : doGenerate();
    },

    async doStream(
      params: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
      const doStream = async () =>
        model.doStream(await doTransform({ params, type: 'stream' }));
      return wrapStream ? wrapStream({ doStream }) : doStream();
    },
  };
};
