import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';

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
  }) => LanguageModelV1CallOptions;
}): LanguageModelV1 => ({
  specificationVersion: 'v1',
  provider,
  modelId,
  defaultObjectGenerationMode: baseModel.defaultObjectGenerationMode,
  doGenerate(
    parameters: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doGenerate']> {
    return baseModel.doGenerate(transform({ parameters }));
  },
  doStream(
    parameters: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doStream']> {
    return baseModel.doStream(transform({ parameters }));
  },
});
