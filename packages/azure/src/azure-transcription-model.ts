import { OpenAITranscriptionModel } from '@ai-sdk/openai/internal';
import {
  JSONValue,
  SharedV3Headers,
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
  TranscriptionModelV3CallWarning,
} from '@ai-sdk/provider';

export class AzureTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';
  private readonly openaiModel: OpenAITranscriptionModel;
  private readonly _modelName?: string;

  constructor(openaiModel: OpenAITranscriptionModel, modelName?: string) {
    this.openaiModel = openaiModel;
    this._modelName = modelName;
  }

  get modelId(): string {
    return this._modelName ?? this.openaiModel.modelId;
  }

  get provider(): string {
    return this.openaiModel.provider;
  }

  doGenerate(options: TranscriptionModelV3CallOptions): PromiseLike<{
    text: string;
    segments: Array<{ text: string; startSecond: number; endSecond: number }>;
    language: string | undefined;
    durationInSeconds: number | undefined;
    warnings: Array<TranscriptionModelV3CallWarning>;
    request?: { body?: string };
    response: {
      timestamp: Date;
      modelId: string;
      headers?: SharedV3Headers;
      body?: unknown;
    };
    providerMetadata?: Record<string, Record<string, JSONValue>>;
  }> {
    return this.openaiModel.doGenerate(options);
  }
}
