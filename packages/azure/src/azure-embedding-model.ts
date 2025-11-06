import { OpenAIEmbeddingModel } from '@ai-sdk/openai/internal';
import { EmbeddingModelV3 } from '@ai-sdk/provider';

export class AzureEmbeddingModel implements EmbeddingModelV3<string> {
  readonly specificationVersion = 'v3';
  readonly maxEmbeddingsPerCall: number;
  readonly supportsParallelCalls: boolean;
  private readonly openaiModel: OpenAIEmbeddingModel;
  private readonly _modelName?: string;

  constructor(openaiModel: OpenAIEmbeddingModel, modelName?: string) {
    this.openaiModel = openaiModel;
    this._modelName = modelName;
    this.maxEmbeddingsPerCall = openaiModel.maxEmbeddingsPerCall;
    this.supportsParallelCalls = openaiModel.supportsParallelCalls;
  }

  get modelId(): string {
    return this._modelName ?? this.openaiModel.modelId;
  }

  get provider(): string {
    return this.openaiModel.provider;
  }

  doEmbed(
    options: Parameters<EmbeddingModelV3<string>['doEmbed']>[0],
  ): ReturnType<EmbeddingModelV3<string>['doEmbed']> {
    return this.openaiModel.doEmbed(options);
  }
}
