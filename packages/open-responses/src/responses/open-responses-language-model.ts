import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult
} from '@ai-sdk/provider';
import { OpenResponsesConfig } from './open-responses-config';


export class OpenResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: string;

    private readonly config: OpenResponsesConfig;

  constructor(modelId: string, config: OpenResponsesConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
  };

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    throw new Error('Not implemented');
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    throw new Error('Not implemented');
  }
}