import { LanguageModelV1 } from '@ai-sdk/provider';
import { VertexAI } from '@google-cloud/vertexai';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';

type GoogleVertexAIConfig = {
  vertexAI: VertexAI;
  generateId: () => string;
};

export class GoogleVertexLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'google-vertex';
  readonly defaultObjectGenerationMode = 'json';

  readonly modelId: GoogleVertexModelId;
  readonly settings: GoogleVertexSettings;

  private readonly config: GoogleVertexAIConfig;

  constructor(
    modelId: GoogleVertexModelId,
    settings: GoogleVertexSettings,
    config: GoogleVertexAIConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    throw new Error('Method not implemented.');
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    throw new Error('Method not implemented.');
  }
}
