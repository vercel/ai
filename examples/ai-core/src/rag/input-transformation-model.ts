import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { getLastUserMessageText } from './get-last-user-message-text';
import { injectIntoLastUserMessage as injectIntoLastUserMessageOriginal } from './inject-into-last-user-message';

export const inputTransformationModel = ({
  modelId,
  provider,
  baseModel,
  transformParams: transformInput,
}: {
  modelId: string;
  provider: string;
  baseModel: LanguageModelV1;
  transformParams: (options: {
    params: LanguageModelV1CallOptions;
    lastUserMessageText: string | undefined;
    addToLastUserMessage: (options: {
      text: string;
    }) => LanguageModelV1CallOptions;
  }) => PromiseLike<LanguageModelV1CallOptions>;
}): LanguageModelV1 => {
  async function doTransform(params: LanguageModelV1CallOptions) {
    const lastUserMessageText = getLastUserMessageText({
      prompt: params.prompt,
    });

    const augmentLastUserMessage = (options: { text: string }) =>
      injectIntoLastUserMessageOriginal({
        text: options.text,
        params,
      });

    return await transformInput({
      params,
      lastUserMessageText,
      addToLastUserMessage: augmentLastUserMessage,
    });
  }

  return {
    specificationVersion: 'v1',
    provider,
    modelId,
    defaultObjectGenerationMode: baseModel.defaultObjectGenerationMode,

    async doGenerate(
      parameters: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
      return baseModel.doGenerate(await doTransform(parameters));
    },

    async doStream(
      parameters: LanguageModelV1CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
      return baseModel.doStream(await doTransform(parameters));
    },
  };
};
