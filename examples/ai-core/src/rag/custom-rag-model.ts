import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { getLastUserMessageText } from './get-last-user-message-text';
import { injectIntoLastUserMessage as injectIntoLastUserMessageOriginal } from './inject-into-last-user-message';
export const customRagModel = ({
  modelId,
  provider,
  baseModel,
  transform,
}: {
  modelId: string;
  provider: string;
  baseModel: LanguageModelV1;
  transform: ({
    parameters,
  }: {
    parameters: LanguageModelV1CallOptions;
    lastUserMessageText: string | undefined;
    injectIntoLastUserMessage: (options: {
      text: string;
    }) => LanguageModelV1CallOptions;
  }) => LanguageModelV1CallOptions;
}): LanguageModelV1 => ({
  specificationVersion: 'v1',
  provider,
  modelId,
  defaultObjectGenerationMode: baseModel.defaultObjectGenerationMode,
  doGenerate(
    parameters: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doGenerate']> {
    const lastUserMessageText = getLastUserMessageText({
      prompt: parameters.prompt,
    });

    const injectIntoLastUserMessage = (options: { text: string }) =>
      injectIntoLastUserMessageOriginal({
        text: options.text,
        parameters,
      });

    return baseModel.doGenerate(
      transform({ parameters, lastUserMessageText, injectIntoLastUserMessage }),
    );
  },
  doStream(
    parameters: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doStream']> {
    const lastUserMessageText = getLastUserMessageText({
      prompt: parameters.prompt,
    });

    const injectIntoLastUserMessage = (options: { text: string }) =>
      injectIntoLastUserMessageOriginal({
        text: options.text,
        parameters,
      });

    return baseModel.doStream(
      transform({ parameters, lastUserMessageText, injectIntoLastUserMessage }),
    );
  },
});
