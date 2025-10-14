import { OpenAIImageModel } from '@ai-sdk/openai/internal';
import { ImageModelV3 } from '@ai-sdk/provider';

export class AzureImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  private readonly openaiModel: OpenAIImageModel;
  private readonly _modelName?: string;

  constructor(openaiModel: OpenAIImageModel, modelName?: string) {
    this.openaiModel = openaiModel;
    this._modelName = modelName;
  }

  get modelId(): string {
    return this._modelName ?? this.openaiModel.modelId;
  }

  get maxImagesPerCall(): ImageModelV3['maxImagesPerCall'] {
    return this.openaiModel.maxImagesPerCall;
  }

  get provider(): string {
    return this.openaiModel.provider;
  }

  doGenerate(
    options: Parameters<ImageModelV3['doGenerate']>[0],
  ): ReturnType<ImageModelV3['doGenerate']> {
    return this.openaiModel.doGenerate(options);
  }
}
