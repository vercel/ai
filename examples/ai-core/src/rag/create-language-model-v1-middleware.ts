import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { getLastUserMessageText } from './get-last-user-message-text';
import { injectIntoLastUserMessage as injectIntoLastUserMessageOriginal } from './inject-into-last-user-message';

export const createLanguageModelV1Middleware = ({
  model,
  modelId,
  provider,
  transformParams,
  wrapGenerate,
  wrapStream,
}: {
  model: LanguageModelV1;
  modelId?: string;
  provider?: string;
  transformParams?: (options: {
    params: LanguageModelV1CallOptions;
    lastUserMessageText: string | undefined;
    addToLastUserMessage: (options: {
      text: string;
    }) => LanguageModelV1CallOptions;
  }) => PromiseLike<LanguageModelV1CallOptions>;
  wrapGenerate?: (options: {
    doGenerate: () => PromiseLike<
      Awaited<ReturnType<LanguageModelV1['doGenerate']>>
    >;
  }) => PromiseLike<Awaited<ReturnType<LanguageModelV1['doGenerate']>>>;
  wrapStream?: (options: {
    doStream: () => PromiseLike<
      Awaited<ReturnType<LanguageModelV1['doStream']>>
    >;
  }) => PromiseLike<Awaited<ReturnType<LanguageModelV1['doStream']>>>;
}): LanguageModelV1 => {
  async function doTransform(params: LanguageModelV1CallOptions) {
    if (!transformParams) {
      return params;
    }

    return await transformParams({
      params,

      // helpers:
      lastUserMessageText: getLastUserMessageText({
        prompt: params.prompt,
      }),
      addToLastUserMessage: (options: { text: string }) =>
        injectIntoLastUserMessageOriginal({
          text: options.text,
          params,
        }),
    });
  }

  return {
    specificationVersion: 'v1',
    provider: provider ?? model.provider,
    modelId: modelId ?? model.modelId,
    defaultObjectGenerationMode: model.defaultObjectGenerationMode,

    async doGenerate(
      parameters: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
      const doGenerate = async () =>
        model.doGenerate(await doTransform(parameters));
      return wrapGenerate ? wrapGenerate({ doGenerate }) : doGenerate();
    },

    async doStream(
      parameters: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
      const doStream = async () =>
        model.doStream(await doTransform(parameters));
      return wrapStream ? wrapStream({ doStream }) : doStream();
    },
  };
};
