import { OpenAIChatLanguageModel } from '@ai-sdk/openai/internal';
import { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';

/**
 * Azure-specific wrapper for OpenAI Chat Language Model.
 * Allows specifying a separate modelName for telemetry while using
 * the deployment name for Azure API calls.
 */
export class AzureChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  private readonly openaiModel: OpenAIChatLanguageModel;
  private readonly _modelName?: string;

  constructor(openaiModel: OpenAIChatLanguageModel, modelName?: string) {
    this.openaiModel = openaiModel;
    this._modelName = modelName;
  }

  /**
   * The model ID exposed for telemetry and cost tracking.
   * Returns modelName if specified, otherwise returns the deployment name.
   */
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
