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
    callOptions,
  }: {
    callOptions: LanguageModelV1CallOptions;
    // example, not implemented, would take fuller spec and return it based on generate/streaming
    sendSource: (options: {
      title: string;
      previewText: string | undefined;
      url: string | undefined;
    }) => void;
  }) => LanguageModelV1CallOptions;
}): LanguageModelV1 => ({
  specificationVersion: 'v1',
  provider,
  modelId,
  defaultObjectGenerationMode: delegateModel.defaultObjectGenerationMode,
  doGenerate(
    callOptions: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doGenerate']> {
    return delegateModel.doGenerate(
      transform({ callOptions, sendSource: () => {} }),
    );
  },
  doStream(
    callOptions: LanguageModelV1CallOptions,
  ): ReturnType<LanguageModelV1['doStream']> {
    return delegateModel.doStream(
      transform({ callOptions, sendSource: () => {} }),
    );
  },
});
