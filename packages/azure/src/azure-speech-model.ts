import { OpenAISpeechModel } from '@ai-sdk/openai/internal';
import { SpeechModelV3 } from '@ai-sdk/provider';

export class AzureSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  private readonly openaiModel: OpenAISpeechModel;
  private readonly _modelName?: string;

  constructor(openaiModel: OpenAISpeechModel, modelName?: string) {
    this.openaiModel = openaiModel;
    this._modelName = modelName;
  }

  get modelId(): string {
    return this._modelName ?? this.openaiModel.modelId;
  }

  get provider(): string {
    return this.openaiModel.provider;
  }

  doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): ReturnType<SpeechModelV3['doGenerate']> {
    return this.openaiModel.doGenerate(options);
  }
}
