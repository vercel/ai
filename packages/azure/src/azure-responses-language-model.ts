import { OpenAIResponsesLanguageModel } from '@ai-sdk/openai/internal';
import { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';

export class AzureResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  private readonly openaiModel: OpenAIResponsesLanguageModel;
  private readonly _modelName?: string;

  constructor(openaiModel: OpenAIResponsesLanguageModel, modelName?: string) {
    this.openaiModel = openaiModel;
    this._modelName = modelName;
  }

  get modelId(): string {
    return this._modelName ?? this.openaiModel.modelId;
  }

  get provider(): string {
    return this.openaiModel.provider;
  }

  get supportedUrls() {
    return this.openaiModel.supportedUrls;
  }

  doGenerate(
    options: LanguageModelV3CallOptions,
  ): ReturnType<LanguageModelV3['doGenerate']> {
    return this.openaiModel.doGenerate(options);
  }

  doStream(
    options: LanguageModelV3CallOptions,
  ): ReturnType<LanguageModelV3['doStream']> {
    return this.openaiModel.doStream(options);
  }
}
