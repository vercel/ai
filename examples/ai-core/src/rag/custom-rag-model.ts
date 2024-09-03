import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';

export const customRagModel = ({
  modelId,
  provider,
  delegateModel,
  transform,
}: {
  modelId: string;
  provider: string;
  delegateModel: LanguageModelV1;
  transform: ({
    parameters,
  }: {
    parameters: LanguageModelV1CallOptions;
  }) => LanguageModelV1CallOptions;
}): LanguageModelV1 => ({
  specificationVersion: 'v1',
  provider,
  modelId,
  defaultObjectGenerationMode: delegateModel.defaultObjectGenerationMode,
  doGenerate(
    parameters: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doGenerate']> {
    return delegateModel.doGenerate(transform({ parameters }));
  },
  doStream(
    parameters: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doStream']> {
    return delegateModel.doStream(transform({ parameters }));
  },
});
